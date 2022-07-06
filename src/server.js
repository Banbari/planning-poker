/**
 * HTTP and WebSocket server for the poker application.
 *
 * In general, the server provides communication gateway between clients.
 */

// Getting HTTP_PORT from environment or using 8080 if not set.
HTTP_PORT = process.env.HTTP_PORT || 8080;

// Starting a simple WebSocket broadcast server.
var WebSocketServer = require("ws").Server; // webSocket library

// Configure the webSocket server.
// port number for the webSocket server
const websocketServerInstance = new WebSocketServer({ noServer: true });
let clientsBySessionId = {}; // list of client connections by session id

//  WebSocket Server handlers.
function handleConnection(client, request) {
  console.log("New Connection"); // you have a new client

  function endClient() {
    // Remove disconnected client from the `clientsBySessionId` collection.
    for (let sessionId in clientsBySessionId) {
      for (let playerId in clientsBySessionId[sessionId]) {
        if (clientsBySessionId[sessionId][playerId] === client) {
          console.log(`DELETE CLIENT of playerId '${playerId}'`);
          delete clientsBySessionId[sessionId][playerId];
        }
      }
    }
    console.log("Connection closed.");
  }

  function clientResponse(data) {
    let message = JSON.parse(data);
    console.log("message", message);

    if (message.type === "state") {
      clientsBySessionId[message.sessionId] =
        clientsBySessionId[message.sessionId] ?? {};

      clientsBySessionId[message.sessionId][message.playerId] =
        clientsBySessionId[message.sessionId][message.playerId] ?? client;
    }

    broadcast(message.sessionId, data + "");
  }

  // Set up client event listeners:
  client.on("message", clientResponse);
  client.on("close", endClient);
}

// This function broadcasts messages to all webSocket clients in particular
// session.
function broadcast(sessionId, data) {
  console.log("BROADCAST", sessionId, data);
  // Iterate over the array of clients & send data to each.
  let playerIds = clientsBySessionId[sessionId];
  for (playerId in playerIds) {
    console.log("SEND", `${data} to '${playerId}'`);
    clientsBySessionId[sessionId][playerId].send(data);
  }
}

// Listen for clients and handle them.
websocketServerInstance.on("connection", handleConnection);

// Starting a simple HTTP server to serve static files.
var http = require("http");
var fs = require("fs");
var path = require("path");

let httpServer = http
  .createServer(function (request, response) {
    var webRoot = __dirname;
    var filePath = webRoot + request.url;
    if (filePath == webRoot + "/") filePath = webRoot + "/index.html";

    var extname = path.extname(filePath);
    var contentType = "text/html";
    switch (extname) {
      case ".ico":
        contentType = "image/x-icon";
        break;
      case ".js":
        contentType = "text/javascript";
        break;
      case ".css":
        contentType = "text/css";
        break;
      case ".json":
        contentType = "application/json";
        break;
      case ".png":
        contentType = "image/png";
        break;
      case ".jpg":
        contentType = "image/jpg";
        break;
      case ".svg":
        contentType = "image/svg+xml";
        break;
      case ".wav":
        contentType = "audio/wav";
        break;
    }

    fs.readFile(filePath, function (error, content) {
      if (error) {
        if (error.code == "ENOENT") {
          // If file is not found send the default page instead.
          // Uses to handle URLs like <origin>/<session_id>.
          fs.readFile(webRoot + "/index.html", function (error, content) {
            response.writeHead(200, { "Content-Type": contentType });
            response.end(content, "utf-8");
          });
        } else {
          response.writeHead(500);
          response.end(
            "Sorry, check with the site admin for error: " +
              error.code +
              " ..\n"
          );
          response.end();
        }
      } else {
        response.writeHead(200, { "Content-Type": contentType });
        response.end(content, "utf-8");
      }
    });
  })
  .listen(HTTP_PORT);

console.log(`HTTP/WS server is running on port ${HTTP_PORT}...`);

// Initialize WebSocket connection handling through HTTP.
httpServer.on("upgrade", function upgrade(request, socket, head) {
  websocketServerInstance.handleUpgrade(
    request,
    socket,
    head,
    function done(ws) {
      websocketServerInstance.emit("connection", ws, request);
    }
  );
});

// Exit on Ctrl+C.
process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  process.exit();
});
