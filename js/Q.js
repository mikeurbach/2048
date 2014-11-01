function Q(){
  this.sequenceLength = 16;
  this.initialize([260, 500, 1]);
}

// initialize the Q network with random weights,
// given an architecture defined in shape
Q.prototype.initialize = function(shape){
  var layers = Immutable.Vector.empty();

  // for each layer defined in shape
  for(var layerIndex = 0; layerIndex < shape.length; layerIndex++){
    // make a new layer
    var layer = Immutable.Vector.empty();

    // for each node in this layer
    var depth = shape[layerIndex];
    for(var nodeIndex = 0; nodeIndex < depth; nodeIndex++){
      // make a new node
      var node = new Node();

      // if this isn't an input node
      if(layerIndex > 0){
	// map the previous layer's nodes' as inputs to this node,
	// indexed by their index in the previous layer,
	// with random weights
	prevLayer = layers.get(layerIndex - 1);
	for(var prevIndex = 0; prevIndex < prevLayer.length; prevIndex++){
	  node.weights = node.weights.set(prevIndex, Math.random());
	}
      }

      // save this node into the layer
      layer = layer.set(nodeIndex, node);
    }

    // save this layer into the layers vector
    layers = layers.set(layerIndex, layer);
  }

  this.layers = layers;
}

// score a preprocessed sequence with the current network
Q.prototype.score = function(phi, move){
  // pad with 4 0's, then set the move (one hot)
  phi = phi
    .unshift(0)
    .unshift(0)
    .unshift(0)
    .unshift(0)
    .set(move, 1);

  // set the inputs on the input layer
  var newInputLayer = this.layers
    .get(0)
    .map(function(node, i, seq){
      node.value = phi.get(i);
      return node;
    });
  this.layers.set(0, newInputLayer);

  // run through the deeper layers
  for(var layerIndex = 1; layerIndex < this.layers.length; layerIndex++){
    // get this layer, and the previous one
    var layer = this.layers.get(layerIndex);
    var prevLayer = this.layers.get(layerIndex-1);

    // update this layer from the values of the previous layer
    // and the weights we have stored
    var newLayer = layer.map(function(node, i, seq){
      // set this node's new value
      node.value = sigmoid(node, prevLayer);
      return node;
    });
    this.layers.set(layerIndex, newLayer);
  }

  // return the value of the output layer's one node
  return this.layers.get(-1).get(0).value;
}

// preprocess a sequence into a vector of length 256
Q.prototype.preprocess = function(sequence){
  // slice off the end of the sequence
  var sliced = sequence.slice(-this.sequenceLength).flatten().toVector();

  // if necessary, pad with 0's
  if(sequence.length < this.sequenceLength){
    for(var i = 0; i < 16 * (this.sequenceLength - sequence.length); i++){
      sliced = sliced.unshift(0);
    }
  }
  
  return sliced;
}

function Node(){
  this.value = 0;
  this.weights = Immutable.Map.empty();
  this.bias = Math.random();
}

// squash!
function sigmoid(node, prevLayer){
  var logged = false;
  var weighted = node.weights.reduce(function(sum, weight, index, seq){
    if(!logged){
      console.log(sum, weight, index, seq);
      logged = true;
    }
    return sum + weight * prevLayer.get(index);
  }, node.bias);
  return Math.exp(1 / (1 + Math.exp(-weighted)))
}
