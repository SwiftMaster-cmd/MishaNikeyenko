exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      choices: [
        { message: { content: "Hello world from Netlify function!" } }
      ]
    })
  };
};