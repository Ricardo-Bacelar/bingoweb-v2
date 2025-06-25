
const socket = new WebSocket(`wss://meubingoserver.render.com`); 

let bingoCard = [];
let marked = [...Array(5)].map(() => Array(5).fill(false));
marked[2][2] = true; // coringa

function generateCard() {
  const ranges = [[1,15],[16,30],[31,45],[46,60],[61,75]];
  const table = document.getElementById("bingo");
  for (let col = 0; col < 5; col++) {
    let nums = [];
    while (nums.length < 5) {
      let n = Math.floor(Math.random() * (ranges[col][1] - ranges[col][0] + 1)) + ranges[col][0];
      if (!nums.includes(n)) nums.push(n);
    }
    for (let row = 0; row < 5; row++) {
      if (!bingoCard[row]) bingoCard[row] = [];
      bingoCard[row][col] = nums[row];
    }
  }
  drawCard();
}

function drawCard() {
  const table = document.getElementById("bingo");
  table.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    let row = table.insertRow();
    for (let j = 0; j < 5; j++) {
      let cell = row.insertCell();
      if (i === 2 && j === 2) {
        cell.textContent = "★";
        cell.className = "marked";
      } else {
        let num = bingoCard[i][j];
        cell.textContent = num;
        cell.onclick = () => markCell(i, j);
      }
    }
  }
}

function markCell(i, j) {
  if (marked[i][j]) return;
  marked[i][j] = true;
  drawCard();
  checkWin();
}

function checkWin() {
  const win = (type) => {
    new Audio("sounds/win.mp3").play();
    alert("🎉 BINGO! Você ganhou por " + type);
    socket.send("WINNER");
  };

  for (let i = 0; i < 5; i++) {
    if (marked[i].every(v => v)) return win("linha");
    if (marked.map(r => r[i]).every(v => v)) return win("coluna");
  }
  if ([0,1,2,3,4].every(i => marked[i][i])) return win("diagonal");
  if ([0,1,2,3,4].every(i => marked[i][4-i])) return win("diagonal inversa");
  if (marked.flat().every(v => v)) return win("cartela cheia");
}

socket.onmessage = (e) => {
  const n = parseInt(e.data);
  document.getElementById("lastNum").textContent = `Número sorteado: ${n}`;
  new Audio("sounds/play.mp3").play();
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++)
      if (bingoCard[i][j] === n) markCell(i, j);
};

window.onload = generateCard;
