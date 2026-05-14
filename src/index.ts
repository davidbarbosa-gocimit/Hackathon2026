import { Env, ChatMessage, UserRole } from "./types";

const ROLES = ["employee", "client"] as const;

const MODEL_BY_ROLE: Record<UserRole, string> = {
	employee: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
	client: "@cf/meta/llama-3.1-8b-instruct-fp8",
};

// Each role is mapped to exactly one allowed table. Because the table name is
// looked up from this fixed record (never from user input), it is safe to
// interpolate into the SQL string.
const TABLE_BY_ROLE: Record<UserRole, string> = {
	employee: "package_commercials",
	client: "packages",
};

async function loadTableRows(
	db: D1Database,
	table: string,
): Promise<unknown[]> {
	const { results } = await db
		.prepare(`SELECT * FROM ${table} LIMIT 100`)
		.all();
	return results ?? [];
}

function isUserRole(value: unknown): value is UserRole {
	return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function buildSystemPrompt(role: UserRole, table: string, rows: unknown[]): string {
	return [
		`You are a helpful assistant talking to a user with the "${role}" role.`,
		`You have read access to the "${table}" table only. Do not invent rows or reference other tables.`,
		`Table contents (JSON):`,
		JSON.stringify(rows),
	].join("\n");
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

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const body = (await request.json()) as {
			messages?: ChatMessage[];
			role?: unknown;
		};
		const incomingMessages = body.messages ?? [];
		const userRole: UserRole = isUserRole(body.role) ? body.role : "client";
		const tableName = TABLE_BY_ROLE[userRole];
		const rows = await loadTableRows(env.DB, tableName);

		// Drop any client-supplied system messages and inject our role-scoped one.
		const messages: ChatMessage[] = [
			{ role: "system", content: buildSystemPrompt(userRole, tableName, rows) },
			...incomingMessages.filter((m) => m.role !== "system"),
		];

		const modelId = MODEL_BY_ROLE[userRole] as Parameters<Ai["run"]>[0];

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
