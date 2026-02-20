/**
 * AuthService
 *
 * Handles user authentication, registration, and user management.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

class AuthService {
  /**
   * Create AuthService instance
   * @param {object} options - Configuration options
   * @param {string} options.usersFilePath - Path to users.json file
   * @param {object} options.activityLogger - Activity logger instance
   * @param {object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.usersFilePath = options.usersFilePath || path.join(process.cwd(), 'users.json');
    this.activityLogger = options.activityLogger;
    this.logger = options.logger;
    this.saltRounds = 10;
  }

  // ===========================================================================
  // USER DATA OPERATIONS
  // ===========================================================================

  /**
   * Load users from file
   * @returns {object} Users data { users: [] }
   */
  loadUsers() {
    if (!fs.existsSync(this.usersFilePath)) {
      return { users: [] };
    }
    const data = fs.readFileSync(this.usersFilePath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Save users to file
   * @param {object} usersData - Users data to save
   */
  saveUsers(usersData) {
    fs.writeFileSync(this.usersFilePath, JSON.stringify(usersData, null, 2));
  }

  /**
   * Generate unique user ID
   * @returns {string} Unique user ID
   */
  generateUserId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Find user by username
   * @param {string} username - Username to find
   * @returns {object|undefined} User object or undefined
   */
  findUserByUsername(username) {
    const usersData = this.loadUsers();
    return usersData.users.find(u => u.username === username);
  }

  /**
   * Find user by ID
   * @param {string} userId - User ID to find
   * @returns {object|undefined} User object or undefined
   */
  findUserById(userId) {
    const usersData = this.loadUsers();
    return usersData.users.find(u => u.id === userId);
  }

  // ===========================================================================
  // AUTHENTICATION OPERATIONS
  // ===========================================================================

  /**
   * Register a new user
   * @param {object} userData - User registration data
   * @param {string} userData.username - Username
   * @param {string} userData.password - Password (plain text)
   * @param {string} userData.fullName - Full name
   * @param {string} userData.email - Email address
   * @param {string} userData.institution - Institution
   * @returns {Promise<object>} Result { success, user?, error?, message? }
   */
  async register(userData) {
    const { username, password, fullName, email, institution } = userData;

    // Validation
    if (!username || !password || !fullName || !email || !institution) {
      return {
        success: false,
        error: 'All fields are required'
      };
    }

    // Check if username already exists
    const existingUser = this.findUserByUsername(username);
    if (existingUser) {
      return {
        success: false,
        error: 'Username already exists'
      };
    }

    // Check if email is banned
    if (this.isEmailBanned(email)) {
      return {
        success: false,
        error: 'Registration is not available with this email address. Please contact the administrator.'
      };
    }

    try {
      // Hash password
      const passwordHash = await bcrypt.hash(password, this.saltRounds);

      // Create new user (pending status by default)
      const newUser = {
        id: this.generateUserId(),
        username,
        passwordHash,
        fullName,
        email,
        institution,
        status: 'pending',
        isAdmin: false,
        createdAt: new Date().toISOString()
      };

      // Save user
      const usersData = this.loadUsers();
      usersData.users.push(newUser);
      this.saveUsers(usersData);

      // Log registration
      if (this.activityLogger) {
        this.activityLogger.logRegistration(username, institution);
      }

      if (this.logger) {
        this.logger.info(`New user registered: ${username} (pending approval)`);
      }

      return {
        success: true,
        message: 'Registration successful! Your account is pending approval.',
        user: {
          username: newUser.username,
          fullName: newUser.fullName,
          status: newUser.status
        }
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Registration error:', error);
      }
      return {
        success: false,
        error: 'Registration failed. Please try again.'
      };
    }
  }

  /**
   * Authenticate user login
   * @param {string} username - Username
   * @param {string} password - Password (plain text)
   * @returns {Promise<object>} Result { success, user?, sessionData?, error? }
   */
  async login(username, password) {
    // Validation
    if (!username || !password) {
      return {
        success: false,
        error: 'Username and password are required'
      };
    }

    // Find user
    const user = this.findUserByUsername(username);
    if (!user) {
      if (this.activityLogger) {
        this.activityLogger.logLogin(username, false);
      }
      return {
        success: false,
        error: 'Invalid username or password'
      };
    }

    try {
      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        if (this.activityLogger) {
          this.activityLogger.logLogin(username, false);
        }
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      // Check if user is rejected
      if (user.status === 'rejected') {
        return {
          success: false,
          error: 'Your account has been rejected. Please contact the administrator.',
          rejected: true
        };
      }

      // Check if user is removed
      if (user.status === 'removed') {
        return {
          success: false,
          error: 'Your account has been removed. Please contact the administrator.',
          rejected: true
        };
      }

      // Log successful login
      if (this.activityLogger) {
        this.activityLogger.logLogin(username, true);
      }

      if (this.logger) {
        this.logger.info(`User logged in: ${username} (status: ${user.status})`);
      }

      // Return session data (to be stored in req.session.user)
      const sessionData = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        institution: user.institution,
        status: user.status,
        isAdmin: user.isAdmin
      };

      return {
        success: true,
        message: 'Login successful',
        user: {
          username: user.username,
          fullName: user.fullName,
          status: user.status,
          isAdmin: user.isAdmin
        },
        sessionData,
        redirect: '/'
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('Login error:', error);
      }
      return {
        success: false,
        error: 'Login failed. Please try again.'
      };
    }
  }

  /**
   * Get user info for authenticated session (sanitized for client)
   * @param {object} sessionUser - User object from session
   * @returns {object} Sanitized user info
   */
  getAuthenticatedUserInfo(sessionUser) {
    if (!sessionUser) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        username: sessionUser.username,
        fullName: sessionUser.fullName,
        email: sessionUser.email,
        institution: sessionUser.institution,
        status: sessionUser.status,
        isAdmin: sessionUser.isAdmin
      }
    };
  }

  // ===========================================================================
  // ADMIN OPERATIONS
  // ===========================================================================

  /**
   * Get all users (for admin)
   * @returns {Array} Array of users (without password hashes)
   */
  getAllUsers() {
    const usersData = this.loadUsers();
    return usersData.users.map(user => ({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      institution: user.institution,
      status: user.status,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      approvedAt: user.approvedAt || null,
      removedAt: user.removedAt || null,
      removedBy: user.removedBy || null
    }));
  }

  /**
   * Get pending users (for admin approval)
   * @returns {Array} Array of pending users
   */
  getPendingUsers() {
    return this.getAllUsers().filter(u => u.status === 'pending');
  }

  /**
   * Approve a user
   * @param {string} username - Username to approve
   * @returns {object} Result { success, error? }
   */
  approveUser(username) {
    const usersData = this.loadUsers();
    const userIndex = usersData.users.findIndex(u => u.username === username);

    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    usersData.users[userIndex].status = 'active';
    usersData.users[userIndex].approvedAt = new Date().toISOString();
    this.saveUsers(usersData);

    if (this.logger) {
      this.logger.info(`User approved: ${username}`);
    }

    return { success: true };
  }

  /**
   * Reject a user
   * @param {string} username - Username to reject
   * @returns {object} Result { success, error? }
   */
  rejectUser(username) {
    const usersData = this.loadUsers();
    const userIndex = usersData.users.findIndex(u => u.username === username);

    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    usersData.users[userIndex].status = 'rejected';
    this.saveUsers(usersData);

    if (this.logger) {
      this.logger.info(`User rejected: ${username}`);
    }

    return { success: true };
  }

  /**
   * Remove a user (soft-delete)
   * @param {string} username - Username to remove
   * @param {string} removedBy - Admin username performing the action
   * @returns {object} Result { success, error? }
   */
  removeUser(username, removedBy) {
    const usersData = this.loadUsers();
    const userIndex = usersData.users.findIndex(u => u.username === username);

    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    if (usersData.users[userIndex].isAdmin) {
      return { success: false, error: 'Cannot remove admin users. Use the CLI tool instead.' };
    }

    usersData.users[userIndex].status = 'removed';
    usersData.users[userIndex].removedAt = new Date().toISOString();
    usersData.users[userIndex].removedBy = removedBy;
    this.saveUsers(usersData);

    if (this.logger) {
      this.logger.info(`User removed: ${username} by ${removedBy}`);
    }

    return { success: true };
  }

  // ===========================================================================
  // EMAIL BAN LIST OPERATIONS
  // ===========================================================================

  /**
   * Add an email to the ban list
   * @param {string} email - Email to ban
   * @param {string} bannedBy - Admin username performing the action
   * @returns {object} Result { success, error? }
   */
  banEmail(email, bannedBy) {
    const usersData = this.loadUsers();

    if (!usersData.bannedEmails) {
      usersData.bannedEmails = [];
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Protect admin email addresses
    const adminUser = usersData.users.find(
      u => u.email.toLowerCase().trim() === normalizedEmail && u.isAdmin
    );
    if (adminUser) {
      return { success: false, error: 'Cannot ban admin email addresses. Use the CLI tool instead.' };
    }

    if (usersData.bannedEmails.some(entry => entry.email === normalizedEmail)) {
      return { success: false, error: 'Email is already banned' };
    }

    usersData.bannedEmails.push({
      email: normalizedEmail,
      bannedAt: new Date().toISOString(),
      bannedBy: bannedBy
    });
    this.saveUsers(usersData);

    if (this.logger) {
      this.logger.info(`Email banned: ${normalizedEmail} by ${bannedBy}`);
    }

    return { success: true };
  }

  /**
   * Remove an email from the ban list
   * @param {string} email - Email to unban
   * @returns {object} Result { success, error? }
   */
  unbanEmail(email) {
    const usersData = this.loadUsers();

    if (!usersData.bannedEmails || usersData.bannedEmails.length === 0) {
      return { success: false, error: 'Email is not banned' };
    }

    const normalizedEmail = email.toLowerCase().trim();
    const index = usersData.bannedEmails.findIndex(entry => entry.email === normalizedEmail);

    if (index === -1) {
      return { success: false, error: 'Email is not banned' };
    }

    usersData.bannedEmails.splice(index, 1);
    this.saveUsers(usersData);

    if (this.logger) {
      this.logger.info(`Email unbanned: ${normalizedEmail}`);
    }

    return { success: true };
  }

  /**
   * Get all banned emails
   * @returns {Array} Array of banned email entries
   */
  getBannedEmails() {
    const usersData = this.loadUsers();
    return usersData.bannedEmails || [];
  }

  /**
   * Check if an email is banned
   * @param {string} email - Email to check
   * @returns {boolean} True if email is banned
   */
  isEmailBanned(email) {
    const usersData = this.loadUsers();
    if (!usersData.bannedEmails || usersData.bannedEmails.length === 0) {
      return false;
    }
    const normalizedEmail = email.toLowerCase().trim();
    return usersData.bannedEmails.some(entry => entry.email === normalizedEmail);
  }

  /**
   * Update user password
   * @param {string} username - Username
   * @param {string} newPassword - New password (plain text)
   * @returns {Promise<object>} Result { success, error? }
   */
  async updatePassword(username, newPassword) {
    const usersData = this.loadUsers();
    const userIndex = usersData.users.findIndex(u => u.username === username);

    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    try {
      const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);
      usersData.users[userIndex].passwordHash = passwordHash;
      this.saveUsers(usersData);

      if (this.logger) {
        this.logger.info(`Password updated for user: ${username}`);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update password' };
    }
  }
}

module.exports = AuthService;
