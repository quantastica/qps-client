// Copyright (C) 2014 Vaughn Iverson
//
// Adapted from:
// https://github.com/meteor/meteor/blob/5a5204e3a468b7b498baefb259c88a63b23699cf/packages/minimongo/objectid.js
// https://github.com/meteor/meteor/blob/cc667a487f0f32cf592df14aae80f45d0b3b6d84/packages/random/random.js
//
// Copyright (C) 2011-2014 Meteor Development Group
//
// All contributions licensed under the MIT license: see LICENSE file in this directory

nodeCrypto = require('crypto');

randomHexString = function (digits) {
  var self = this;
  var numBytes = Math.ceil(digits / 2);
  var bytes;
  // Try to get cryptographically strong randomness. Fall back to
  // non-cryptographically strong if not available.
  try {
    bytes = nodeCrypto.randomBytes(numBytes);
  } catch (e) {
    // XXX should re-throw any error except insufficient entropy
    bytes = nodeCrypto.pseudoRandomBytes(numBytes);
  }
  var result = bytes.toString("hex");
  // If the number of digits is odd, we'll have generated an extra 4 bits
  // of randomness, so we need to trim the last digit.
  return result.substring(0, digits);
};

looksLikeObjectID = function (str) {
  return str.length === 24 && str.match(/^[0-9a-f]*$/);
};

ObjectID = function (hexString) {
  // Make new optional
  if (!(this instanceof ObjectID))
    return new ObjectID(hexString);

  //random-based impl of Mongo ObjectID
  var self = this;
  if (hexString && (typeof hexString === 'string')) {
    hexString = hexString.toLowerCase();
    if (!looksLikeObjectID(hexString)) {
      throw new Error("Invalid hexadecimal string for creating an ObjectID");
    }
    // meant to work with _.isEqual(), which relies on structural equality
    self._str = hexString;
  } else {
    self._str = randomHexString(24);
  }
};

ObjectID.prototype.toString = function () {
  var self = this;
  return "ObjectID(\"" + self._str + "\")";
};

ObjectID.prototype.equals = function (other) {
  var self = this;
  return other instanceof ObjectID &&
    self.valueOf() === other.valueOf();
};

ObjectID.prototype.clone = function () {
  var self = this;
  return new ObjectID(self._str);
};

ObjectID.prototype.typeName = function() {
  return "oid";
};

// Only use this if mongodb made this ID, otherwise this will be nonsense
ObjectID.prototype.getTimestamp = function() {
  var self = this;
  return parseInt(self._str.substr(0, 8), 16);
};

ObjectID.prototype.valueOf =
    ObjectID.prototype.toJSONValue =
    ObjectID.prototype.toHexString =
    function () { return this._str; };

// Export ObjectID
module.exports = ObjectID
