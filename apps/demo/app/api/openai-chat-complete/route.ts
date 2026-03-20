import { OPENAI_API_KEY } from "../secrets";

const SYSTEM_PROMPT =
  "You are a helpful assistant. You are being used in a demo. Please act courteously and helpfully.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      message,
      model = "gpt-4o-mini",
      system_prompt = SYSTEM_PROMPT,
      image_analysis,
    } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: image_analysis
          ? `${system_prompt}\n\nIMPORTANT CONTEXT: The user has shared an image with you. You can see this image clearly, and here's what you observe: ${image_analysis}\n\nWhen the user asks questions about what they're seeing or asks questions about the image, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility of the image. Never say you can't see the image or that you're relying on someone else's analysis. You are directly viewing this image.`
          : system_prompt,
      },
      { role: "user", content: message },
    ];

    // Call OpenAI API
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("OpenAI API error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to generate response",
          details: errorData,
        }),
        {
          status: res.status,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const data = await res.json();
    const response = data.choices[0].message.content;

    return new Response(JSON.stringify({ response }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error generating response:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate response" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
