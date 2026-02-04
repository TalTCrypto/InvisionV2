import type { StreamEvent } from "../types";

export class SSEStream {
  static createStream(
    generator: AsyncGenerator<StreamEvent> | AsyncGenerator<{ type: string; data: unknown }>,
  ): ReadableStream {
    return new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of generator) {
            const eventType = event.type;
            const eventData = JSON.stringify(event.data ?? {});
            const sseMessage = `event: ${eventType}\ndata: ${eventData}\n\n`;

            controller.enqueue(encoder.encode(sseMessage));
          }

          controller.enqueue(
            encoder.encode("event: end\ndata: {}\n\n"),
          );
          controller.close();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          const errorData = JSON.stringify({ error: errorMessage });
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${errorData}\n\n`),
          );
          controller.close();
        }
      },
    });
  }

  static createSimpleStream(content: string): ReadableStream {
    return new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const tokens = content.split(" ");
        for (const token of tokens) {
          const data = JSON.stringify({ token: token + " " });
          controller.enqueue(
            encoder.encode(`event: token\ndata: ${data}\n\n`),
          );
        }

        const messageData = JSON.stringify({
          content,
          complete: true,
        });
        controller.enqueue(
          encoder.encode(`event: message\ndata: ${messageData}\n\n`),
        );

        controller.enqueue(encoder.encode("event: end\ndata: {}\n\n"));
        controller.close();
      },
    });
  }
}
