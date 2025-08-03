const mongoose = require('mongoose');

const factCheckSchema = new mongoose.Schema({
  claim: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['verified', 'false', 'unverified', 'partially_true', 'misleading', 'error'],
    required: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  sources: [{
    title: String,
    url: String,
    credibilityScore: Number,
    content: String
  }],
  reasoning: {
    type: String,
    required: true
  },
  verificationSteps: [{
    type: String
  }],
  sourceAnalysis: {
    consensus: String,
    supportingCount: Number,
    refutingCount: Number,
    neutralCount: Number,
    sourceQuality: String
  },
  userId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  originalMessage: {
    type: String,
    required: true
  },
  flagged: {
    type: Boolean,
    default: false
  },
  flagReason: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
factCheckSchema.index({ userId: 1, createdAt: -1 });
factCheckSchema.index({ channelId: 1, createdAt: -1 });
factCheckSchema.index({ claim: 'text' });

// Update the updatedAt field on save
factCheckSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find recent fact-checks for a user
factCheckSchema.statics.findRecentByUser = function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
};

// Static method to find flagged content in a channel
factCheckSchema.statics.findFlaggedInChannel = function(channelId, limit = 5) {
  return this.find({ channelId, flagged: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
};

// Instance method to check if fact-check is high confidence
factCheckSchema.methods.isHighConfidence = function() {
  return this.confidence >= 0.8;
};

// Instance method to check if content should be flagged
factCheckSchema.methods.shouldFlag = function() {
  return this.isHighConfidence() && 
         ['false', 'misleading'].includes(this.status) &&
         this.sources.length >= 2;
};

const FactCheck = mongoose.model('FactCheck', factCheckSchema);

module.exports = FactCheck;
