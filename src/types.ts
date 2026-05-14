/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	AI: Ai;
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	DB: D1Database;
	AI_GATEWAY_ID?: string;
	ACCESS_TEAM_DOMAIN?: string;
	ACCESS_AUD?: string;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export type UserRole = "employee" | "client";
