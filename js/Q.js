function Q(sequenceLength, shape, learningRate){
  this.shape = shape;
  this.sequenceLength = sequenceLength;
  this.learningRate = learningRate;

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
  // reset all the nodes on the input layer
  this.activations[0].subset(math.index([0, 260], [0, 1]), math.zeros(260, 1));

  // set the activations on the input layer nodes for the board state
  this.activations[0].subset(math.index([0, 256], [0, 1]), phi);

  // turn on one of the last four nodes for the choice
  this.activations[0].subset(math.index(256 + move, 0), 1.0);

  // feed the activations through the network
  for(var layer = 1; layer < this.shape.length; layer++){
    this.feedforward(layer);
  }

  // return the activation on the final node
  return this.activations[this.shape.length - 1].subset(math.index(0, 0));
}

// perform a gradient descent step via backpropagation
// http://neuralnetworksanddeeplearning.com/chap2.html#the_backpropagation_algorithm
Q.prototype.backprop = function(phi, move, y){
  // initialize array to hold error vectors, set L to last layer
  var errors = this.weights.map(function(){ return null; });
  var L = this.weights.length - 1;
  
  // steps 1 and 2, put inputs on first layer and feed activation forward
  this.score(phi, move);

  // step 3, set error for the last layer
  // note: we use a rectified linear unit on the output layer, sigmoid is its derivative
  var a = this.activations[L];
  var w = this.weights[L];
  var b = this.biases[L];
  var z = zvec(w, a, b);
  var aprime = math.map(z, function(z){ return sigmoid(z); });
  errors[L] = math.dotMultiply(math.subtract(aprime, y),
			       math.map(z, function(z){ return sigmoid(z); }));

  // step 4, backpropagate error
  // note: we use logistic sigmoid units on the hidden layers, sigmoidPrime is its derivative
  for(var layer = L - 1; layer >= 0; layer--){
    a = this.activations[layer];
    w = this.weights[layer];
    b = this.biases[layer];
    z = zvec(w, a, b);
    errors[layer] = math.dotMultiply(math.multiply(math.transpose(this.weights[layer+1]), errors[layer+1]),
				     math.map(z, function(z){ return sigmoidPrime(z); }));
  }

  // step 5, perform a gradient descent step
  var newWeights = null;
  var newBiases = null;
  var size = null;
  for(layer = 0; layer <= L; layer++){
    newWeights = math.subtract(this.weights[layer],
			       math.multiply(this.learningRate, 
					     math.multiply(errors[layer], math.transpose(this.activations[layer]))));
    size = this.weights[layer].size();
    this.weights[layer].subset(math.index([0, size[0]], [0, size[1]]), newWeights);

    newBiases = math.subtract(this.biases[layer], math.multiply(this.learningRate, errors[layer]));
    size = this.biases[layer].size();
    this.biases[layer].subset(math.index([0, size[0]], [0, size[1]]), newBiases);
  }
}

// compute a layer's activations
Q.prototype.feedforward = function(layer){
  var self = this;
  var a = this.activations[layer - 1];
  var w = this.weights[layer - 1];
  var b = this.biases[layer - 1];

  // note: we use a rectified linear unit on the output layer because we are calculating a score.
  // the hidden layers use a logistic sigmoid unit
  var aprime = math.map(zvec(w, a, b), function(z){ return layer == self.weights.length ? softplus(z) : sigmoid(z); });

  var size = this.activations[layer].size();
  this.activations[layer].subset(math.index([0, size[0]], [0, size[1]]), aprime);
}

// preprocess a sequence into a vector of length 256
Q.prototype.preprocess = function(sequence){
  // take the last 16 boards (latest board is head of list)
  return math.resize(sequence, [256], 0);
}

// weighted input to layer
function zvec(w, a, b){
  return math.add(math.multiply(w, a), b);
}

// softplus function
function softplus(z){
  return math.log(math.add(1.0, math.map(z, function(z){ return Math.exp(z); })));
}

// logistic function (derivative of softplus unit)
function sigmoid(z){
  return 1.0 / (1.0 + math.map(z, function(z){ return Math.exp(-z); }));
}

// derivative of logistic function
function sigmoidPrime(z){
  return sigmoid(z) * (1 - sigmoid(z));
}
