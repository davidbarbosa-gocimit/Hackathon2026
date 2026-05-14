import { Env, ChatMessage, UserRole } from "./types";
import { verifyAccessJWT } from "./auth/access-jwt";

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

const MODEL_BY_ROLE: Record<UserRole, string> = {
	employee: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
	client: "@cf/meta/llama-3.1-8b-instruct-fp8",
};

// Each role is mapped to the tables it may read. Because the table names are
// looked up from this fixed record (never from user input), it is safe to
// interpolate them into the SQL string.
const TABLES_BY_ROLE: Record<UserRole, readonly string[]> = {
	employee: ["packages", "package_commercials"],
	client: ["packages"],
};

interface ResolvedIdentity {
	email: string | null;
	role: UserRole;
}

async function loadTablesForRole(
	db: D1Database,
	tables: readonly string[],
): Promise<Record<string, unknown[]>> {
	const entries = await Promise.all(
		tables.map(async (table) => {
			const { results } = await db
				.prepare(`SELECT * FROM ${table} LIMIT 100`)
				.all();
			return [table, results ?? []] as const;
		}),
	);
	return Object.fromEntries(entries);
}

async function lookupRole(
	db: D1Database,
	email: string,
): Promise<UserRole | null> {
	const row = await db
		.prepare("SELECT role FROM users WHERE email = ?1")
		.bind(email)
		.first<{ role: string }>();
	if (row?.role === "employee" || row?.role === "internal") return "employee";
	if (row?.role === "client" || row?.role === "customer") return "client";
	return null;
}

/**
 * Resolves the caller identity. With Access configured, the role comes from
 * the verified JWT email looked up against `users`. Without Access, falls
 * back to the safer `client` role — never trusts a role from the request body.
 */
async function resolveIdentity(
	request: Request,
	env: Env,
): Promise<ResolvedIdentity> {
	const teamDomain = env.ACCESS_TEAM_DOMAIN;
	const aud = env.ACCESS_AUD;
	const token = request.headers.get(ACCESS_JWT_HEADER);

	if (!teamDomain || !aud || !token) {
		return { email: null, role: "client" };
	}

	const identity = await verifyAccessJWT(token, teamDomain, aud);
	const role = (await lookupRole(env.DB, identity.email)) ?? "client";
	return { email: identity.email, role };
}

function buildSystemPrompt(
	role: UserRole,
	tables: Record<string, unknown[]>,
): string {
	const tableNames = Object.keys(tables);
	const lines: string[] = [
		`You are a helpful assistant talking to a user with the "${role}" role.`,
		`You have read access to the following tables only: ${tableNames
			.map((n) => `"${n}"`)
			.join(", ")}. Do not invent rows or reference other tables.`,
	];
	for (const [name, rows] of Object.entries(tables)) {
		lines.push(`Table "${name}" contents (JSON):`);
		lines.push(JSON.stringify(rows));
	}
	return lines.join("\n");
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		if (url.pathname === "/api/chat") {
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}
			return new Response("Method not allowed", { status: 405 });
		}

		if (url.pathname === "/api/me" && request.method === "GET") {
			return handleWhoAmI(request, env);
		}

		if (url.pathname === "/api/health/db" && request.method === "GET") {
			return handleDbHealth(env);
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Returns the caller's resolved role and email for the frontend to display.
 */
async function handleWhoAmI(request: Request, env: Env): Promise<Response> {
	try {
		const identity = await resolveIdentity(request, env);
		return Response.json({
			email: identity.email,
			role: identity.role,
			access_enabled: Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD),
		});
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 401 },
		);
	}
}

/**
 * Health check for the D1 binding. Returns row counts per table to confirm
 * the Worker can reach the catalog DB.
 */
async function handleDbHealth(env: Env): Promise<Response> {
	try {
		const [packages, commercials, users] = await Promise.all([
			env.DB.prepare("SELECT COUNT(*) AS count FROM packages").first<{ count: number }>(),
			env.DB.prepare("SELECT COUNT(*) AS count FROM package_commercials").first<{ count: number }>(),
			env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
		]);

		return Response.json({
			ok: true,
			counts: {
				packages: packages?.count ?? 0,
				package_commercials: commercials?.count ?? 0,
				users: users?.count ?? 0,
			},
		});
	} catch (error) {
		return Response.json(
			{ ok: false, error: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}

async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	let identity: ResolvedIdentity;
	try {
		identity = await resolveIdentity(request, env);
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Unauthorized" },
			{ status: 401 },
		);
	}

	try {
		const body = (await request.json()) as { messages?: ChatMessage[] };
		const incomingMessages = body.messages ?? [];
		const tables = await loadTablesForRole(
			env.DB,
			TABLES_BY_ROLE[identity.role],
		);

		// Drop any client-supplied system messages and inject our role-scoped one.
		const messages: ChatMessage[] = [
			{ role: "system", content: buildSystemPrompt(identity.role, tables) },
			...incomingMessages.filter((m) => m.role !== "system"),
		];

		const modelId = MODEL_BY_ROLE[identity.role] as Parameters<Ai["run"]>[0];

		const stream = await env.AI.run(
			modelId,
			{
				messages,
				max_tokens: 1024,
				stream: true,
			},
			env.AI_GATEWAY_ID
				? {
						gateway: {
							id: env.AI_GATEWAY_ID,
							skipCache: false,
							cacheTtl: 3600,
						},
					}
				: undefined,
		);

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
