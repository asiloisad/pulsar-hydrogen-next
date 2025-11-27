/** @babel */

/**
 * Execution time utilities for formatting and calculating execution times.
 * Shared between hydrogen-next and jupyter-next for consistent time display.
 */

export const NO_EXECTIME_STRING = "Not available";

/**
 * Format execution time from milliseconds to human-readable string.
 *
 * @param {number} ms - Execution time in milliseconds
 * @returns {string|null} - Formatted time string or null if invalid
 */
export function formatExecutionTime(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) {
    return null;
  }

  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }
}

/**
 * Calculate execution time from Jupyter message timestamps.
 * Given a message whose type is `execute_reply`, calculates execution time
 * and returns its string representation.
 *
 * @param {Object} message - A Message object with header and parent_header dates
 * @returns {string} - Formatted execution time or NO_EXECTIME_STRING if unavailable
 */
export function executionTime(message) {
  if (!message?.parent_header?.date || !message?.header?.date) {
    return NO_EXECTIME_STRING;
  }

  const start = Date.parse(message.parent_header.date);
  const end = Date.parse(message.header.date);

  if (isNaN(start) || isNaN(end)) {
    return NO_EXECTIME_STRING;
  }

  const time = end - start; // milliseconds

  let sec = time / 1000; // seconds

  if (sec < 60) {
    return `${sec.toFixed(3)} sec`;
  }

  let min = (sec - (sec % 60)) / 60;
  sec = Math.round(sec % 60);

  if (min < 60) {
    return `${min} min ${sec} sec`;
  }

  const hour = (min - (min % 60)) / 60;
  min %= 60;
  return `${hour} h ${min} m ${sec} s`;
}

/**
 * Calculate execution time in milliseconds from Jupyter message.
 *
 * @param {Object} message - A Message object with header and parent_header dates
 * @returns {number|null} - Execution time in milliseconds or null if unavailable
 */
export function getExecutionTimeMs(message) {
  if (!message?.parent_header?.date || !message?.header?.date) {
    return null;
  }

  const start = Date.parse(message.parent_header.date);
  const end = Date.parse(message.header.date);

  if (isNaN(start) || isNaN(end)) {
    return null;
  }

  return end - start;
}

/**
 * Create an execution time tracker for a cell.
 *
 * @returns {Object} - Tracker object with start(), stop(), and getTime() methods
 */
export function createExecutionTimeTracker() {
  let startTime = null;
  let executionTime = null;

  return {
    /**
     * Start tracking execution time
     */
    start() {
      startTime = Date.now();
      executionTime = null;
    },

    /**
     * Stop tracking and calculate execution time
     * @returns {number|null} - Execution time in milliseconds
     */
    stop() {
      if (startTime !== null) {
        executionTime = Date.now() - startTime;
        startTime = null;
      }
      return executionTime;
    },

    /**
     * Get the current or calculated execution time
     * @returns {number|null} - Execution time in milliseconds
     */
    getTime() {
      if (startTime !== null) {
        // Currently running - return elapsed time
        return Date.now() - startTime;
      }
      return executionTime;
    },

    /**
     * Get formatted execution time
     * @returns {string|null} - Formatted time string
     */
    getFormattedTime() {
      const time = this.getTime();
      return time !== null ? formatExecutionTime(time) : null;
    },

    /**
     * Check if currently tracking
     * @returns {boolean}
     */
    isRunning() {
      return startTime !== null;
    },

    /**
     * Reset the tracker
     */
    reset() {
      startTime = null;
      executionTime = null;
    },
  };
}
