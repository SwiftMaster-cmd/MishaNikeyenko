// netlify/functions-swift/swiftgpt.js

export async function handler(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: "✅ Hello from SwiftGPT! Your connection works."
          }
        }
      ]
    })
  };
}