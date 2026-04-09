import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';

import {
  Billium,
  BilliumError,
  BilliumWebhookSignatureError,
  BilliumWebhookTimestampError,
} from '../src/index';

const SECRET = 'test_secret_key_abc123';

function buildSignature(
  body: string,
  secret: string,
  timestampSeconds: number,
): string {
  const hmac = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${body}`)
    .digest('hex');
  return `t=${timestampSeconds},v1=${hmac}`;
}

function freshTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

const SAMPLE_PAYLOAD = {
  event: 'invoice.paid',
  id: 'evt_abc123',
  data: { invoiceId: 'inv_xyz', amount: 100 },
  timestamp: new Date().toISOString(),
};

describe('Billium.webhooks.verify — constructor secret', () => {
  const billium = new Billium({ webhookSecret: SECRET });

  it('verifies without passing secret explicitly', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const sig = buildSignature(body, SECRET, ts);

    const event = billium.webhooks.verify(body, sig);
    expect(event.event).toBe('invoice.paid');
  });

  it('explicit secret overrides constructor secret', () => {
    const otherSecret = 'other_secret_xyz';
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const sig = buildSignature(body, otherSecret, ts);

    const event = billium.webhooks.verify(body, sig, otherSecret);
    expect(event.event).toBe('invoice.paid');
  });

  it('throws BilliumError when no secret is available', () => {
    const billiumNoSecret = new Billium({});
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const sig = buildSignature(body, SECRET, ts);

    expect(() =>
      billiumNoSecret.webhooks.verify(body, sig),
    ).toThrow(BilliumError);
  });
});

describe('Billium.webhooks.verify — explicit secret + signature checks', () => {
  // No merchantId is passed, so the constructor builds an unconfigured client
  // and the apiKey is never used — these tests only exercise the signature
  // verification helpers, which take the webhook secret as a separate arg.
  const billium = new Billium({ apiKey: 'sk_test_fixture_not_a_real_key' });

  it('returns the parsed event for a valid signature (string body)', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const sig = buildSignature(body, SECRET, ts);

    const event = billium.webhooks.verify(body, sig, SECRET);

    expect(event.event).toBe('invoice.paid');
    expect(event.id).toBe('evt_abc123');
  });

  it('returns the parsed event for a valid signature (Buffer body)', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const sig = buildSignature(body, SECRET, ts);

    const event = billium.webhooks.verify(Buffer.from(body), sig, SECRET);

    expect(event.event).toBe('invoice.paid');
  });

  it('throws BilliumWebhookSignatureError on wrong secret', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const sig = buildSignature(body, 'wrong_secret', ts);

    expect(() =>
      billium.webhooks.verify(body, sig, SECRET),
    ).toThrow(BilliumWebhookSignatureError);
  });

  it('throws BilliumWebhookSignatureError on tampered body', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const sig = buildSignature(body, SECRET, ts);
    const tamperedBody = body.replace('invoice.paid', 'invoice.created');

    expect(() =>
      billium.webhooks.verify(tamperedBody, sig, SECRET),
    ).toThrow(BilliumWebhookSignatureError);
  });

  it('throws BilliumWebhookSignatureError on malformed header — missing t=', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();
    const hmac = createHmac('sha256', SECRET)
      .update(`${ts}.${body}`)
      .digest('hex');

    expect(() =>
      billium.webhooks.verify(body, `v1=${hmac}`, SECRET),
    ).toThrow(BilliumWebhookSignatureError);
  });

  it('throws BilliumWebhookSignatureError on malformed header — missing v1=', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp();

    expect(() =>
      billium.webhooks.verify(body, `t=${ts}`, SECRET),
    ).toThrow(BilliumWebhookSignatureError);
  });

  it('throws BilliumWebhookSignatureError on completely empty header', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);

    expect(() =>
      billium.webhooks.verify(body, '', SECRET),
    ).toThrow(BilliumWebhookSignatureError);
  });

  it('throws BilliumWebhookTimestampError when timestamp exceeds default tolerance', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const oldTs = freshTimestamp() - 400; // 400s ago > default 300s
    const sig = buildSignature(body, SECRET, oldTs);

    expect(() =>
      billium.webhooks.verify(body, sig, SECRET),
    ).toThrow(BilliumWebhookTimestampError);
  });

  it('disables timestamp check when tolerance is 0 (any timestamp accepted if signature is valid)', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ancientTs = 1000000; // year 1970
    const sig = buildSignature(body, SECRET, ancientTs);

    expect(() =>
      billium.webhooks.verify(body, sig, SECRET, { tolerance: 0 }),
    ).not.toThrow();
  });

  it('accepts timestamp within a custom tolerance window', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp() - 50;
    const sig = buildSignature(body, SECRET, ts);

    expect(() =>
      billium.webhooks.verify(body, sig, SECRET, { tolerance: 60 }),
    ).not.toThrow();
  });

  it('rejects timestamp just outside a custom tolerance window', () => {
    const body = JSON.stringify(SAMPLE_PAYLOAD);
    const ts = freshTimestamp() - 61;
    const sig = buildSignature(body, SECRET, ts);

    expect(() =>
      billium.webhooks.verify(body, sig, SECRET, { tolerance: 60 }),
    ).toThrow(BilliumWebhookTimestampError);
  });
});
