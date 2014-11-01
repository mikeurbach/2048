function Q(sequenceLength, shape){
  this.shape = shape;
  this.sequenceLength = sequenceLength;

  // slice up our shape array
  var fromLayers = shape.slice(0,-1);
  var toLayers = shape.slice(1);
  var weightSizes = fromLayers.map(function(s, i){ return [toLayers[i], fromLayers[i]]; });

  // biases for the non-input layers
  this.biases = toLayers.map(function(size){
    return math.map(math.ones(size, 1), function(bias){ return bias * Math.random(); });
  });

  // weights for all the layers
  this.weights = weightSizes.map(function(size){
    return math.map(math.ones(size[0], size[1]), function(weight){ return weight * Math.random(); });
  });

  // activations for all layers
  this.activations = shape.map(function(size){
    return math.zeros(size, 1);
  });

  return this;
}

// score a preprocessed sequence by feeding it through the current network
Q.prototype.score = function(phi, move){
  // set the activation on the input layer to phi
  this.activations[0].subset(math.index([0, 256], [0, 1]), phi);

  // turn on one of the last four nodes 
  this.activations[0].subset(math.index(256 + move, 0), 1.0);

  // feed the activations through the network
  for(var i = 1; i < this.shape.length; i++){
    this.feedforward(i);
  }

  // return the activation on the final node
  return this.activations[this.shape.length - 1].subset(math.index(0, 0));
}

// preprocess a sequence into a vector of length 256
Q.prototype.preprocess = function(sequence){
  // take the last 16 boards (latest board is head of list)
  return math.resize(sequence, [256], 0);
}

// compute a layer's activations
Q.prototype.feedforward = function(layer){
  var a = this.activations[layer - 1];
  var w = this.weights[layer - 1];
  var b = this.biases[layer - 1];

  var aprime = math.map(math.add(math.multiply(w, a), b), function(aprime){ return sigmoid(aprime); });

  this.activations[layer].subset(math.index([0, this.shape[layer]], [0, 1]), aprime);
}

// squash!
function sigmoid(z){
  return 1.0 / (1.0 + Math.exp(-z));
}
