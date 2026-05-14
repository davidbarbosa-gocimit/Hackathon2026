/**
 * Verifies a Cloudflare Access JWT and exposes the verified identity.
 *
 * Cloudflare Access signs every request that reaches a protected app with a
 * JWT placed in the `Cf-Access-Jwt-Assertion` header. The signing keys are
 * published at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and
 * rotate, so verification must fetch them on demand.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AccessIdentity {
	email: string;
	sub: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(teamDomain: string) {
	let jwks = jwksCache.get(teamDomain);
	if (!jwks) {
		const url = new URL(
			`https://${teamDomain}/cdn-cgi/access/certs`,
		);
		jwks = createRemoteJWKSet(url);
		jwksCache.set(teamDomain, jwks);
	}
	return jwks;
}

export async function verifyAccessJWT(
	token: string,
	teamDomain: string,
	audience: string,
): Promise<AccessIdentity> {
	const { payload } = await jwtVerify(token, getJWKS(teamDomain), {
		issuer: `https://${teamDomain}`,
		audience,
	});
	return extractIdentity(payload);
}

function extractIdentity(payload: JWTPayload): AccessIdentity {
	const email = typeof payload.email === "string" ? payload.email : "";
	const sub = typeof payload.sub === "string" ? payload.sub : "";
	if (!email || !sub) {
		throw new Error("Access JWT missing email or sub claim");
	}
	return { email, sub };
}
