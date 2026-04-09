export class BilliumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BilliumError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BilliumWebhookSignatureError extends BilliumError {
  constructor(message: string) {
    super(message);
    this.name = 'BilliumWebhookSignatureError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BilliumWebhookTimestampError extends BilliumError {
  constructor(message: string) {
    super(message);
    this.name = 'BilliumWebhookTimestampError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BilliumApiError extends BilliumError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'BilliumApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
