class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warning: 1,
      info: 2,
      debug: 3
    };
  }

  log(level, message, data = null) {
    if (this.levels[level] <= this.levels[this.logLevel]) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...(data && { data })
      };

      console.log(JSON.stringify(logEntry));
    }
  }

  error(message, data) {
    this.log('error', message, data);
  }

  warning(message, data) {
    this.log('warning', message, data);
  }

  info(message, data) {
    this.log('info', message, data);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  logFactCheck(userId, claim, result) {
    this.log('info', 'Fact-check performed', {
      userId,
      claim,
      status: result.status,
      confidence: result.confidence,
      flagged: result.flagged || false
    });
  }

  logMisinformationFlag(userId, analysis) {
    this.log('warning', 'Misinformation flagged', {
      userId,
      type: analysis.type,
      confidence: analysis.confidence,
      claimsCount: analysis.claims ? analysis.claims.length : 0
    });
  }
}

module.exports = Logger;
