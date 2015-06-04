function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;

  this.inputManager.on("train", this.train.bind(this));
  this.inputManager.on("move", this.makeMove.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
  this.train();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
    this.temperature = previousState.temperature;
    this.didntMove   = previousState.didntMove;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;
    this.temperature = 100;
    this.didntMove   = 0;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile(this.grid);
  }
};

// Adds a tile in the top left (worst case addRandomTile)
GameManager.prototype.addTileXY = function(grid, x, y) {
  if(grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile({x: x, y: y}, value);

    grid.insertTile(tile);
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function (grid) {
  if (grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(grid.randomAvailableCell(), value);

    grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying,
    temperature: this.temperature
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell, grid) {
  grid.cells[tile.x][tile.y] = null;
  grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector, self.grid);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest, self.grid);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile(this.grid);

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector, grid) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (grid.withinBounds(cell) &&
           grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

// 
// 
// 
//    additions
// 
// 
// 

var DIRECTIONS = {
  0: 'up',
  1: 'right',
  2: 'down',
  3: 'left'
};

var M = 2;
var EPSILON = 0;
var GAMMA = 0.5;

// deep Q-learning with experience replay
// http://arxiv.org/pdf/1312.5602v1.pdf
// Algorithm 1
GameManager.prototype.train = function() {
  console.log('train - called');
  this.actuator.isTraining = true;

  // initialize replay memory
  this.D = [];

  // initialize Q network
  this.Q = new Q(16, [260, 500, 1], 3.0);

  // run M training episodes
  for(var episode = 0; episode < M; episode++){
    // get first grid, initialize sequence, and preprocess phi
    var grid = this.grid.toVector();
    var sequence = [grid];
    var phi = this.Q.preprocess(grid);

    // play till game over
    var moves = 0;
    while(!this.isGameTerminated()){
      // behavior distribution (epsilon-greedy strategy)
      var action;
      if(Math.random() < EPSILON){
	// select a random action with probability EPSILON
	console.log("train - picking random move");
	action = this.randomMove();
      } else {
	// select the Q network's idea of the best action
	console.log("train - picking Q network's favorite move");
	action = this.bestMove(phi);
      }

      // execute action in the emulator, if we're not in a terminal state
      if(action.newGrid){
	console.log("train - moving: " + DIRECTIONS[action.move]);
	this.move(action.move);
      }

      // observe reward and new grid from the emulator
      var reward = this.score;
      var newGrid = this.grid.toVector();

      // store action and new grid in this game's sequence
      sequence.push(action.move);
      sequence.push(newGrid);

      // preprocess next phi
      var newPhi = this.Q.preprocess(newGrid);

      // store transition in replay memory
      var transition = {
	phi: phi,
	move: action.move,
	reward: reward,
	newPhi: newPhi,
	isTerminal: this.isGameTerminated()
      };
      this.D.push(transition);

      // sample a transition uniformly at random from D
      console.log("train - sampling a random transition");
      var sampleTransition = math.pickRandom(this.D);

      var y;
      if(sampleTransition.isTerminal){
	// terminal transition, y is reward
	console.log("train - terminal transition");
	y = sampleTransition.reward;
      } else {
	// non-terminal transition, y is reward + gamma * Q's best score for next move
	console.log("train - non-terminal transition");
	y = sampleTransition.reward + GAMMA * this.bestMove(sampleTransition.newPhi).score;
      }

      // perform a gradient descent step on (y - Q's best score for this move)^2
      console.log("train - running one backpropagation iteration");
      this.Q.backprop(sampleTransition.phi, sampleTransition.move, y);

      moves++;
    }

    // hit restart, without training again
    console.log("train - " + (episode + 1) + " games played (moves: "+ moves +", score: "+ this.score +")");
    this.actuator.continueGame();
    this.storageManager.clearGameState();
    this.setup();
  }
}

GameManager.prototype.makeMove = function () {
  console.log('makeMove - called');
};

GameManager.prototype.randomMove = function(){
  // order the possible moves randomly
  var moves = shuffle([0,1,2,3]);
  var move = null;
  var madeMove = false;
  var newGrid = null;

  // while we have moves to try
  while(moves.length > 0 && !madeMove){
    // take a move
    move = moves.shift();
    newGrid = this.generateGrid(move, this.grid.serialize());

    if(!newGrid){
      // if we couldn't move, set newGrid to false
      newGrid = false;
    } else {
      // if we could move set the flag
      madeMove = true;
    }
  }

  // return the latest move
  return {newGrid: newGrid, move: move};
};

GameManager.prototype.bestMove = function(phi){
  var newGrid = null;
  var move = null;
  var bestMove = null
  var score = null;
  var bestScore = -Infinity;

  // pick the locally optimal move based on our current Q network
  var moves = [0,1,2,3];
  while(moves.length > 0){
    move = moves.shift();

    // ensure this move is valid
    newGrid = this.generateGrid(move, this.grid.serialize());
    if(newGrid){
      score = this.Q.score(phi, move);
      if(score > bestScore){
	bestMove = move;
	bestScore = score;
      }
    }
  }


  // return the optimal move
  return {newGrid: score != null, move: bestMove, score: bestScore};
};

// helpers

GameManager.prototype.generateGrid = function (direction, currentGridState) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  var newGrid = new Grid(currentGridState.size, currentGridState.cells);

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = newGrid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector, newGrid);
        var next      = newGrid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          newGrid.insertTile(merged);
          newGrid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);
        } else {
          self.moveTile(tile, positions.farthest, newGrid);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  var ret;
  if (moved) {
    this.addRandomTile(newGrid);
    ret = newGrid;
  } else {
    ret = false;
  }

  return ret;
};

// http://bost.ocks.org/mike/shuffle/
function shuffle(array) {
  var m = array.length, t, i;

  // While there remain elements to shuffle…
  while (m) {

    // Pick a remaining element…
    i = Math.floor(Math.random() * m--);

    // And swap it with the current element.
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }

  return array;
}
