// 🔹 animatedBackground.js – Visual chat state indicators with blobs

const canvas = document.createElement("canvas");
canvas.id = "chat-background-canvas";
document.body.prepend(canvas);

const ctx = canvas.getContext("2d");
let width, height;
let blobs = [];

const COLORS = {
  idle: ["#7e3af266", "#9c27b066", "#673ab766"],
  sending: ["#ff980066", "#ffc10766", "#ff572266"],
  waiting: ["#2196f366", "#00bcd466", "#03a9f466"],
  replying: ["#4caf5066", "#8bc34a66", "#cddc3966"],
};

let currentState = "idle";

function resizeCanvas() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Blob class
class Blob {
  constructor(x, y, r, dx, dy, color) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.dx = dx;
    this.dy = dy;
    this.color = color;
  }

  move() {
    this.x += this.dx;
    this.y += this.dy;
    if (this.x < -this.r || this.x > width + this.r) this.dx *= -1;
    if (this.y < -this.r || this.y > height + this.r) this.dy *= -1;
  }

  draw(ctx) {
    ctx.beginPath();
    const gradient = ctx.createRadialGradient(this.x, this.y, this.r * 0.1, this.x, this.y, this.r);
    gradient.addColorStop(0, this.color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function createBlobs() {
  blobs = [];
  const colors = COLORS[currentState];
  for (let i = 0; i < 8; i++) {
    blobs.push(
      new Blob(
        Math.random() * width,
        Math.random() * height,
        180 + Math.random() * 100,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        colors[Math.floor(Math.random() * colors.length)]
      )
    );
  }
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  blobs.forEach(blob => {
    blob.move();
    blob.draw(ctx);
  });
  requestAnimationFrame(draw);
}

function setBackgroundState(state) {
  if (!COLORS[state]) return;
  currentState = state;
  createBlobs();
}

window.setBackgroundState = setBackgroundState; // Allow global use

// Init
createBlobs();
draw();