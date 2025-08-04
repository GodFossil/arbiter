const mongoose = require('mongoose');

const factCheckSchema = new mongoose.Schema({
  claim: {
    type: String,
    required: true,
    trim: true,
    index: 'text',
    minlength: 10,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['verified', 'false', 'unverified', 'partially_true', 'misleading', 'error'],
    required: true,
    index: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  sources: {
    type: [{
      title: {
        type: String,
        maxlength: 200
      },
      url: {
        type: String,
        validate: {
          validator: v => validator.isURL(v, { protocols: ['http','https'], require_protocol: true }),
          message: 'Invalid URL'
        }
      },
      reliabilityScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 80
      },
      snippet: {
        type: String,
        maxlength: 500
      }
    }],
    validate: [sources => sources.length <= 10, 'Maximum 10 sources allowed']
  },
  reasoning: {
    type: String,
    required: true
  },
  verificationSteps: [{
    type: String
  }],
  sourceAnalysis: {
    consensus: {
      type: String,
      enum: ['strong-support', 'mixed', 'weak-support', 'unclear'],
      default: 'unclear'
    },
    averageReliability: {
      type: Number,
      min: 0,
      max: 100
    },
    conflictingSources: {
      type: Boolean,
      default: false
    }
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

// Optimized compound indexes
factCheckSchema.index({ 
  userId: 1, 
  status: 1, 
  confidence: -1 
});

factCheckSchema.index({ 
  channelId: 1, 
  createdAt: -1 
},{ 
  partialFilterExpression: { 
    flagged: true 
  } 
});

// TTL index for automatic data expiration (6 months)
factCheckSchema.index({ 
  createdAt: 1 
}, { 
  expireAfterSeconds: 15552000 
});

// Text index with weights
factCheckSchema.index(
  { claim: 'text' },
  {
    weights: {
      claim: 10,
      'sources.title': 5,
      'sources.snippet': 3
    },
    name: 'factcheck_text_search'
  }
);

// Update the updatedAt field on save
factCheckSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Optimized query methods
factCheckSchema.statics.findRecentByUser = function(userId, limit = 10) {
  return this.find({ userId })
    .select('-__v -_id -verificationSteps')  // Exclude unused fields
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()  // Return plain JS objects
    .exec();
};

factCheckSchema.statics.findHighConfidenceIssues = function(minConfidence = 0.8) {
  return this.find({
    confidence: { $gte: minConfidence },
    status: { $in: ['false', 'misleading'] }
  })
  .sort({ confidence: -1 })
  .lean()
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

// Enhanced flagging logic with TTL
factCheckSchema.methods.shouldFlag = function() {
  const isFlagCandidate = this.isHighConfidence() && 
                        ['false', 'misleading'].includes(this.status) &&
                        this.sourceAnalysis.averageReliability >= 70;
  
  // Auto-expire flagging after 30 days
  if (isFlagCandidate) {
    this.flagged = true;
    this.flagTTL = Date.now() + 2592000000;  // 30 days in milliseconds
  }
  
  return isFlagCandidate;
};

// Document transformation to hide implementation details
factCheckSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  }
});

const FactCheck = mongoose.model('FactCheck', factCheckSchema);

module.exports = FactCheck;
