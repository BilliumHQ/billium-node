import { Billium } from '@billium/node';

/**
 * Builds a Billium SDK client from environment variables.
 *
 * Required:
 *   BILLIUM_API_KEY      — secret API key (sk_...)
 *   BILLIUM_MERCHANT_ID  — merchant ID (mer_...)
 * Optional:
 *   BILLIUM_BASE_URL     — override the API base URL (self-hosted / testing)
 *
 * Throws a clear error (listing what's missing) so misconfiguration fails fast
 * at startup rather than as a confusing 401 on the first tool call.
 */
export function billiumFromEnv(env: NodeJS.ProcessEnv = process.env): Billium {
  const apiKey = env.BILLIUM_API_KEY?.trim();
  const merchantId = env.BILLIUM_MERCHANT_ID?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push('BILLIUM_API_KEY');
  if (!merchantId) missing.push('BILLIUM_MERCHANT_ID');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Generate a secret API key in the Billium dashboard under ' +
        'Settings → Developer → API keys.',
    );
  }

  return new Billium({
    apiKey,
    merchantId,
    baseUrl: env.BILLIUM_BASE_URL?.trim() || undefined,
  });
}
