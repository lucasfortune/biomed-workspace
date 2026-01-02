const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const path = require('path');

const usersFilePath = path.join(__dirname, 'users.json');

/**
 * Load users from file
 */
function loadUsers() {
  if (!fs.existsSync(usersFilePath)) {
    return { users: [] };
  }
  const data = fs.readFileSync(usersFilePath, 'utf8');
  return JSON.parse(data);
}

/**
 * Save users to file
 */
function saveUsers(usersData) {
  fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));
}

/**
 * Generate unique user ID using cryptographically secure random bytes
 */
function generateUserId() {
  return crypto.randomUUID();
}

/**
 * Add a new admin user
 */
async function addAdmin(username, password, fullName, email, institution) {
  const usersData = loadUsers();
  
  // Check if username already exists
  if (usersData.users.find(u => u.username === username)) {
    console.error(`❌ Error: Username '${username}' already exists`);
    process.exit(1);
  }
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Create new user
  const newUser = {
    id: generateUserId(),
    username,
    passwordHash,
    fullName,
    email,
    institution,
    status: 'active',
    isAdmin: true,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'system'
  };
  
  usersData.users.push(newUser);
  saveUsers(usersData);
  
  console.log(`✅ Admin user '${username}' created successfully`);
}

/**
 * Approve a pending user
 */
function approveUser(username, approvedBy) {
  const usersData = loadUsers();
  const user = usersData.users.find(u => u.username === username);
  
  if (!user) {
    console.error(`❌ Error: User '${username}' not found`);
    process.exit(1);
  }
  
  if (user.status === 'active') {
    console.log(`⚠️  User '${username}' is already approved`);
    process.exit(0);
  }
  
  user.status = 'active';
  user.approvedAt = new Date().toISOString();
  user.approvedBy = approvedBy;
  
  saveUsers(usersData);
  console.log(`✅ User '${username}' approved successfully`);
}

/**
 * Reject a pending user
 */
function rejectUser(username) {
  const usersData = loadUsers();
  const user = usersData.users.find(u => u.username === username);
  
  if (!user) {
    console.error(`❌ Error: User '${username}' not found`);
    process.exit(1);
  }
  
  user.status = 'rejected';
  user.rejectedAt = new Date().toISOString();
  
  saveUsers(usersData);
  console.log(`✅ User '${username}' rejected`);
}

/**
 * List all users
 */
function listUsers() {
  const usersData = loadUsers();
  
  if (usersData.users.length === 0) {
    console.log('No users found');
    return;
  }
  
  console.log('\n📋 All Users:\n');
  usersData.users.forEach(user => {
    const statusEmoji = user.status === 'active' ? '✅' : user.status === 'pending' ? '⏳' : '❌';
    const adminBadge = user.isAdmin ? ' [ADMIN]' : '';
    console.log(`${statusEmoji} ${user.username}${adminBadge}`);
    console.log(`   Name: ${user.fullName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Institution: ${user.institution}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Created: ${new Date(user.createdAt).toLocaleString()}`);
    if (user.approvedAt) {
      console.log(`   Approved: ${new Date(user.approvedAt).toLocaleString()} by ${user.approvedBy}`);
    }
    console.log('');
  });
}

/**
 * List pending users only
 */
function listPending() {
  const usersData = loadUsers();
  const pendingUsers = usersData.users.filter(u => u.status === 'pending');
  
  if (pendingUsers.length === 0) {
    console.log('No pending users');
    return;
  }
  
  console.log('\n⏳ Pending Users:\n');
  pendingUsers.forEach(user => {
    console.log(`👤 ${user.username}`);
    console.log(`   Name: ${user.fullName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Institution: ${user.institution}`);
    console.log(`   Registered: ${new Date(user.createdAt).toLocaleString()}`);
    console.log('');
  });
}

/**
 * Reset password
 */
async function resetPassword(username, newPassword) {
  const usersData = loadUsers();
  const user = usersData.users.find(u => u.username === username);
  
  if (!user) {
    console.error(`❌ Error: User '${username}' not found`);
    process.exit(1);
  }
  
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  saveUsers(usersData);
  
  console.log(`✅ Password reset for user '${username}'`);
}

// Parse command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

(async () => {
  switch (command) {
    case 'add-admin':
      if (args.length < 5) {
        console.log('Usage: node manageUsers.js add-admin <username> <password> <fullName> <email> <institution>');
        console.log('Example: node manageUsers.js add-admin admin MyPassword123 "Admin User" admin@university.edu "My University"');
        process.exit(1);
      }
      await addAdmin(args[0], args[1], args[2], args[3], args[4]);
      break;
      
    case 'approve':
      if (args.length < 1) {
        console.log('Usage: node manageUsers.js approve <username> [approvedBy]');
        process.exit(1);
      }
      approveUser(args[0], args[1] || 'admin');
      break;
      
    case 'reject':
      if (args.length < 1) {
        console.log('Usage: node manageUsers.js reject <username>');
        process.exit(1);
      }
      rejectUser(args[0]);
      break;
      
    case 'list':
      listUsers();
      break;
      
    case 'list-pending':
      listPending();
      break;
      
    case 'reset-password':
      if (args.length < 2) {
        console.log('Usage: node manageUsers.js reset-password <username> <newPassword>');
        process.exit(1);
      }
      await resetPassword(args[0], args[1]);
      break;
      
    default:
      console.log('Available commands:');
      console.log('  add-admin <username> <password> <fullName> <email> <institution>');
      console.log('  approve <username> [approvedBy]');
      console.log('  reject <username>');
      console.log('  list');
      console.log('  list-pending');
      console.log('  reset-password <username> <newPassword>');
      process.exit(1);
  }
})();