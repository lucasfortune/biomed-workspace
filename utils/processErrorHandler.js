/**
 * Python Process Error Handler
 *
 * Unified error handling for spawned Python processes.
 * Handles ENOENT, EACCES, and other spawn errors gracefully.
 */

/**
 * Stderr buffer with size limit to prevent memory issues
 */
class StderrBuffer {
  constructor(maxSize = 5000) {
    this.buffer = '';
    this.maxSize = maxSize;
  }

  append(data) {
    const newData = data.toString();
    this.buffer += newData;

    // Trim buffer if it exceeds max size
    if (this.buffer.length > this.maxSize) {
      this.buffer = '...[truncated]...\n' + this.buffer.slice(-this.maxSize);
    }

    return newData;
  }

  getBuffer() {
    return this.buffer;
  }

  clear() {
    this.buffer = '';
  }
}

/**
 * Get user-friendly error message for spawn errors
 */
function getSpawnErrorMessage(error, pythonPath) {
  switch (error.code) {
    case 'ENOENT':
      return {
        title: 'Python Interpreter Not Found',
        message: `The Python interpreter could not be found at: ${pythonPath}`,
        suggestions: [
          'Ensure the virtual environment is set up correctly',
          'Run: python -m venv venv',
          'Run: source venv/bin/activate && pip install -r requirements.txt'
        ]
      };

    case 'EACCES':
      return {
        title: 'Permission Denied',
        message: `Cannot execute Python interpreter at: ${pythonPath}`,
        suggestions: [
          'Check file permissions',
          'Run: chmod +x ' + pythonPath
        ]
      };

    case 'EMFILE':
      return {
        title: 'Too Many Open Files',
        message: 'System limit for open files reached',
        suggestions: [
          'Close some applications',
          'Increase system file descriptor limit'
        ]
      };

    default:
      return {
        title: 'Process Spawn Error',
        message: `Failed to start Python process: ${error.message}`,
        suggestions: [
          'Check Python installation',
          'Verify virtual environment is activated',
          'Check system resources'
        ]
      };
  }
}

/**
 * Attach error handler to a spawned Python process
 *
 * @param {ChildProcess} pythonProcess - The spawned Python process
 * @param {object} options - Configuration options
 * @param {string} options.processType - Type of process (training/inference)
 * @param {string} options.processId - Unique process identifier
 * @param {string} options.pythonPath - Path to Python interpreter
 * @param {object} options.io - Socket.IO instance
 * @param {Map} options.sessionMap - Session map (trainingSessions or inferenceSessions)
 * @param {function} options.onError - Optional callback on error
 * @returns {StderrBuffer} Stderr buffer instance
 */
function attachErrorHandler(pythonProcess, options) {
  const {
    processType,
    processId,
    pythonPath,
    io,
    sessionMap,
    onError
  } = options;

  const stderrBuffer = new StderrBuffer(5000);
  const roomName = `${processType}-${processId}`;

  // Handle spawn errors (ENOENT, EACCES, etc.)
  pythonProcess.on('error', (error) => {
    console.error(`[${processType.toUpperCase()}] Process spawn error:`, error);

    // Update session status
    const session = sessionMap.get(processId);
    if (session) {
      session.status = 'failed';
      session.endTime = new Date();
      session.error = error.message;
    }

    // Get user-friendly error message
    const errorInfo = getSpawnErrorMessage(error, pythonPath);

    // Log detailed error
    console.error(`[${processType.toUpperCase()}] ${errorInfo.title}`);
    console.error(`[${processType.toUpperCase()}] ${errorInfo.message}`);
    console.error(`[${processType.toUpperCase()}] Suggestions:`);
    errorInfo.suggestions.forEach(s => console.error(`  - ${s}`));

    // Emit error to client via Socket.IO
    io.to(roomName).emit(`${processType}-error`, {
      error: errorInfo.title,
      message: errorInfo.message,
      suggestions: errorInfo.suggestions,
      code: error.code
    });

    // Emit completion event with failure status
    io.to(roomName).emit(`${processType}-complete`, {
      success: false,
      error: errorInfo.message
    });

    // Call optional error callback
    if (onError) {
      onError(error, errorInfo);
    }
  });

  // Buffer stderr output
  pythonProcess.stderr.on('data', (data) => {
    const errorText = stderrBuffer.append(data);
    console.error(`[${processType.toUpperCase()}] stderr:`, errorText);
  });

  return stderrBuffer;
}

/**
 * Create error handler configuration for training processes
 */
function createTrainingErrorHandler(trainingId, pythonPath, io, trainingSessions, onError) {
  return {
    processType: 'training',
    processId: trainingId,
    pythonPath,
    io,
    sessionMap: trainingSessions,
    onError
  };
}

/**
 * Create error handler configuration for inference processes
 */
function createInferenceErrorHandler(inferenceId, pythonPath, io, inferenceSessions, onError) {
  return {
    processType: 'inference',
    processId: inferenceId,
    pythonPath,
    io,
    sessionMap: inferenceSessions,
    onError
  };
}

module.exports = {
  StderrBuffer,
  attachErrorHandler,
  createTrainingErrorHandler,
  createInferenceErrorHandler,
  getSpawnErrorMessage
};
