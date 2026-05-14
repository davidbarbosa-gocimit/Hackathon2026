import { Env, ChatMessage, UserRole } from "./types";
import { verifyAccessJWT, type AccessIdentity } from "./auth/access-jwt";

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

/**
 * Verifies the Cloudflare Access JWT from the request. Returns the identity
 * or throws if the JWT is missing or invalid. Used to defend `/api/chat-internal`
 * against requests that bypass Access (e.g. direct curl to the Worker URL).
 */
async function requireAccessIdentity(
	request: Request,
	env: Env,
): Promise<AccessIdentity> {
	const token = request.headers.get(ACCESS_JWT_HEADER);
	if (!token) {
		throw new Error("Missing Cloudflare Access JWT");
	}
	if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
		throw new Error("Access not configured on the Worker");
	}
	return verifyAccessJWT(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
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

		if (url.pathname === "/api/chat" && request.method === "POST") {
			return handlePublicChat(request, env);
		}

		if (url.pathname === "/api/chat-internal" && request.method === "POST") {
			return handleInternalChat(request, env);
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
 * Identity endpoint, only meaningful inside the Access-protected pages.
 * For the public chat it just reports an anonymous client.
 */
async function handleWhoAmI(request: Request, env: Env): Promise<Response> {
	const token = request.headers.get(ACCESS_JWT_HEADER);
	if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
		return Response.json({ email: null, role: "client" });
	}
	try {
		const identity = await verifyAccessJWT(
			token,
			env.ACCESS_TEAM_DOMAIN,
			env.ACCESS_AUD,
		);
		return Response.json({ email: identity.email, role: "employee" });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Unauthorized" },
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

async function handlePublicChat(
	request: Request,
	env: Env,
): Promise<Response> {
	return runChat(request, env, "client");
}

async function handleInternalChat(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		await requireAccessIdentity(request, env);
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "Unauthorized" },
			{ status: 401 },
		);
	}
	return runChat(request, env, "employee");
}

async function runChat(
	request: Request,
	env: Env,
	role: UserRole,
): Promise<Response> {
	try {
		const body = (await request.json()) as { messages?: ChatMessage[] };
		const incomingMessages = body.messages ?? [];
		const tables = await loadTablesForRole(env.DB, TABLES_BY_ROLE[role]);

		// Drop any client-supplied system messages and inject our role-scoped one.
		const messages: ChatMessage[] = [
			{ role: "system", content: buildSystemPrompt(role, tables) },
			...incomingMessages.filter((m) => m.role !== "system"),
		];

		const modelId = MODEL_BY_ROLE[role] as Parameters<Ai["run"]>[0];

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
