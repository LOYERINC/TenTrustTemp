declare module '@mono.co/connect.js' {
  interface ConnectOptions {
    key: string;
    scope?: string;
    data?: Record<string, any>;
    onSuccess?: (data: { code: string }) => void;
    onClose?: () => void;
    onLoad?: () => void;
    onEvent?: (eventName: string, data: any) => void;
  }

  export default class Connect {
    constructor(options: ConnectOptions);
    setup(): void;
    open(): void;
    close(): void;
  }
}
