function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;

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
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();

  // Make a move every second
  
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile(this.grid);
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
    keepPlaying: this.keepPlaying
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

GameManager.prototype.makeMove = function () {
  var gridTree = this.generateMoveChildren(this.grid, 0, 5);
  this.findMinInTree(gridTree, 0, 5);
  this.move(gridTree.leastDirection);
  console.log('moved ' + DIRECTIONS[gridTree.leastDirection]);
};

GameManager.prototype.findMinInTree = function (grid, depth, maxDepth) {
  if(depth < maxDepth){
    for(var d = 0; d < 4; d++){
      if(grid[d] !== undefined){
	this.findMinInTree(grid[d], depth+1, maxDepth);
	if(grid[d].leastEntropy < grid.leastEntropy){
	  grid.leastEntropy = grid[d].leastEntropy;
	  grid.leastDirection = d;
	}
      }
    }
  }
}

GameManager.prototype.generateMoveChildren = function (grid, depth, maxDepth) {
  // set the best entropy on the grid
  var grids = this.generateGrids(grid.serialize());
  var entropies = this.calculateEntropies(grids);
  var entropyVals = this.chooseLeastEntropy(entropies);
  grid.leastEntropy = entropyVals.entropy;
  grid.leastDirection = entropyVals.dir;

  // if not a child, recurse
  if(depth < maxDepth){
    for(var d = 0; d < 4; d++){
      if(grids[d] !== undefined){
	grid[d] = grids[d];
	this.generateMoveChildren(grid[d], depth+1, maxDepth);
      } else {
	delete grid[d]; // weird?
      }
    }
  } 

  // return the grid if we're root
  if(depth == 0){
    return grid;
  }
};

GameManager.prototype.generateGrids = function (currentGridState) {
  var grids = {};
  for(var dir = 0; dir < 4; dir++){
    var newGrid = this.generateGrid(dir, currentGridState);
    if(newGrid)
      grids[dir] = newGrid;
  }
  return grids;
};

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

  ret = moved ? newGrid : false;
  if(ret)
    this.addRandomTile(newGrid);

  return ret;
};

GameManager.prototype.calculateEntropies = function (grids) {
  var entropies = {}

  // for each direction
  for(var dir = 0; dir < 4; dir++){
    var grid = grids[dir];
    
    // not all directions yield new grids
    if(grid){
      // initializations for this direction
      var entropy = 0;
      var total = 0;
      var maxTile = -Infinity;
      var maxLoc = {};
      var cellsAvailable = 0;

      // for each cell
      for(var x = 0; x < grid.size; x++){
	for(var y = 0; y < grid.size; y++){
	  if(grid.cells[x][y]){
	    // subtract this cell's value squared, so 4 is favored to two 2's
	    entropy -= Math.pow(grid.cells[x][y].value, 2);

	    // keep track of max value
	    if(grid.cells[x][y].value > maxTile){
	      maxTile = grid.cells[x][y].value;
	      maxLoc.x = x;
	      maxLoc.y = y;
	    }

	    // keep track of total value
	    total += grid.cells[x][y].value;

	    // sum adjacent cells squared distances
	    if(y < grid.size - 1 && grid.cells[x][y + 1]){
	      entropy += Math.pow(grid.cells[x][y].value - grid.cells[x][y + 1].value, 2);
	      // if(grid.cells[x][y].value == grid.cells[x][y + 1].value)
	      // 	entropy -= Math.exp(grid.cells[x][y].value);
	    }
	    if(x < grid.size - 1 && grid.cells[x + 1][y]){
	      entropy += Math.pow(grid.cells[x][y].value - grid.cells[x + 1][y].value, 2);
	      // if(grid.cells[x][y].value == grid.cells[x + 1][y].value)
	      // 	entropy -= Math.exp(grid.cells[x][y].value);
	    }
	    if(y > 0 && grid.cells[x][y - 1]){
	      entropy += Math.pow(grid.cells[x][y].value - grid.cells[x][y - 1].value, 2);
	      // if(grid.cells[x][y].value == grid.cells[x][y - 1].value)
	      // 	entropy -= Math.exp(grid.cells[x][y].value);
	    }
	    if(x > 0 && grid.cells[x - 1][y]){
	      entropy += Math.pow(grid.cells[x][y].value - grid.cells[x - 1][y].value, 2);
	      // if(grid.cells[x][y].value == grid.cells[x - 1][y].value)
	      // 	entropy -= Math.exp(grid.cells[x][y].value);
	    }

	    // take away the value of a cell if it is on the edge
	    // if(x == 0 || x == grid.size || y == 0 || y == grid.size)
	    //   entropy -= grid.cells[x][y].value;
	  }
	}
      }

      // keep track of cells available
      cellsAvailable = grid.cellsAvailable();

      // if the biggest tile isn't on a corner, freak out
      if(!(maxLoc.x == 0 && maxLoc.y == 0) && 
	 !(maxLoc.x == 0 && maxLoc.y == grid.size) && 
	 !(maxLoc.x == grid.size && maxLoc.y == 0) && 
	 !(maxLoc.x == grid.size && maxLoc.y == grid.size))
	entropy = Math.pow(entropy,2);

      // entropy for this direction, could also use total, maxTile, cellsAvailable, or others
      entropies[dir] = entropy;
    } 
  }
  
  return entropies;
};

GameManager.prototype.chooseLeastEntropy = function (entropies) {
  var min = Infinity;
  var minDir = -1;

  for(var dir = 0; dir < 4; dir++){
    if(entropies[dir] < min){
      min = entropies[dir];
      minDir = dir;
    }
  }

  return {entropy: min, dir: minDir};
};