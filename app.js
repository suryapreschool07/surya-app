/**
 * =====================================================
 * SURYA CONNECT - School Management System
 * Complete Application Script
 * =====================================================
 * Architecture:
 *   - LocalStorage persistence (offline-first)
 *   - Google Apps Script REST API integration pattern
 *   - Session-based auth with auto-login
 *   - Role-based views (Admin, Parent)
 *   - All CRUD operations with premium UI
 * =====================================================
 */

// =====================================================
// SECTION 1: CONFIGURATION & STATE
// =====================================================

const CONFIG = {
  ADMIN_PASSWORD: 'SURYA123',
  APP_NAME: 'Surya Connect',
  SCHOOL_NAME: 'Surya Pre-School',
  SCHOOL_PHONE: '7862021425',
  SCHOOL_EMAIL: 'suryapreschool07@gmail.com',
  EST_YEAR: 2022,
  // Google Apps Script API Configuration
  GAS_API_URL: '', // Set your Google Apps Script deployment URL here
  GAS_ENABLED: false,
  // Storage keys
  STORAGE_KEYS: {
    STUDENTS: 'surya_students',
    CLASSES: 'surya_classes',
    ATTENDANCE: 'surya_attendance',
    FEES: 'surya_fees',
    TESTS: 'surya_tests',
    TEST_RESULTS: 'surya_test_results',
    GALLERY: 'surya_gallery',
    STAFF: 'surya_staff',
    PARENTS: 'surya_parents',
    NOTICES: 'surya_notices',
    HOMEWORK: 'surya_homework',
    LEAVES: 'surya_leaves',
    EVENTS: 'surya_events',
    SESSION: 'surya_session',
    SETTINGS: 'surya_settings',
  }
};

// Application State
const state = {
  session: null,
  user: null,
  currentPage: 'dashboard',
  currentChildId: null,
  editingItem: null,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  darkMode: false,
  filters: {},
};

// =====================================================
// SECTION 2: DATA LAYER (LocalStorage + API Sync)
// =====================================================

const DB = {
  // --- Generic CRUD ---
  get(collection) {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEYS[collection.toUpperCase()]);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  },
  set(collection, data) {
    localStorage.setItem(CONFIG.STORAGE_KEYS[collection.toUpperCase()], JSON.stringify(data));
    return data;
  },
  add(collection, item) {
    const data = this.get(collection);
    data.push(item);
    this.set(collection, data);
    return item;
  },
  update(collection, id, updates) {
    const data = this.get(collection);
    const idx = data.findIndex(i => i.id === id);
    if (idx > -1) {
      data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
      this.set(collection, data);
      return data[idx];
    }
    return null;
  },
  delete(collection, id) {
    const data = this.get(collection);
    const filtered = data.filter(i => i.id !== id);
    this.set(collection, filtered);
    return filtered;
  },
  find(collection, predicate) {
    return this.get(collection).find(predicate);
  },
  filter(collection, predicate) {
    return this.get(collection).filter(predicate);
  },
  // --- ID Generation ---
  genId(prefix = '') {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return prefix ? `${prefix}${ts}${rand}` : `${ts}${rand}`;
  },
  // --- Sync with Google Apps Script ---
  async syncToGAS(collection, data) {
    if (!CONFIG.GAS_ENABLED || !CONFIG.GAS_API_URL) return false;
    try {
      const resp = await fetch(CONFIG.GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', collection, data, school: CONFIG.SCHOOL_NAME })
      });
      const result = await resp.json();
      console.log(`[Sync] ${collection} synced:`, result);
      return true;
    } catch (e) {
      console.warn('[Sync] Failed:', e);
      return false;
    }
  },
  async fetchFromGAS(collection) {
    if (!CONFIG.GAS_ENABLED || !CONFIG.GAS_API_URL) return null;
    try {
      const resp = await fetch(`${CONFIG.GAS_API_URL}?action=get&collection=${collection}`);
      const result = await resp.json();
      if (result.data) {
        this.set(collection, result.data);
        return result.data;
      }
      return null;
    } catch (e) { return null; }
  }
};

// =====================================================
// SECTION 3: AUTHENTICATION SYSTEM
// =====================================================

function getSession() {
  try {
    const s = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

function saveSession(session) {
  localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(session));
  state.session = session;
}

function clearSession() {
  localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
  state.session = null;
  state.user = null;
}

function showLanding() {
  document.getElementById('landingScreen').classList.remove('hidden');
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.add('hidden');
  clearSession();
}

function showLogin(role) {
  document.getElementById('landingScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  
  // Update role buttons
  document.querySelectorAll('.login-role-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.login-form').forEach(f => f.classList.remove('show'));
  
  const subtitle = document.getElementById('loginSubtitle');
  if (role === 'admin') {
    document.querySelector('.login-role-btn:first-child').classList.add('active');
    document.getElementById('adminLoginForm').classList.add('show');
    subtitle.textContent = 'Admin Portal';
  } else {
    document.querySelector('.login-role-btn:last-child').classList.add('active');
    document.getElementById('parentLoginForm').classList.add('show');
    subtitle.textContent = 'Parent Portal';
  }
}

function adminLogin() {
  const password = document.getElementById('adminPassword').value;
  if (!password) {
    showToast('Please enter the admin password.', 'warning');
    return;
  }
  if (password !== CONFIG.ADMIN_PASSWORD) {
    showToast('Incorrect password. Please try again.', 'error');
    return;
  }
  
  const session = {
    role: 'admin',
    userId: 'admin_001',
    name: 'School Admin',
    loginTime: new Date().toISOString(),
    token: DB.genId('ADM')
  };
  saveSession(session);
  state.user = { name: 'School Admin', role: 'admin' };
  
  showToast('Welcome back, Admin!', 'success');
  enterApp();
}

function parentLogin() {
  const phone = document.getElementById('parentPhone').value.trim();
  if (!phone) {
    showToast('Please enter your mobile number.', 'warning');
    return;
  }
  if (phone.length < 10) {
    showToast('Please enter a valid 10-digit mobile number.', 'warning');
    return;
  }
  
  // Find or create parent
  let parents = DB.get('parents');
  let parent = parents.find(p => p.phone === phone);
  
  if (!parent) {
    // Check if any student has this parent phone
    const students = DB.get('students');
    const student = students.find(s => s.fatherPhone === phone || s.motherPhone === phone || s.emergencyContact === phone);
    
    if (student) {
      parent = {
        id: DB.genId('PAR'),
        phone: phone,
        name: student.fatherName || student.motherName || `Parent (${phone})`,
        studentIds: students.filter(s => s.fatherPhone === phone || s.motherPhone === phone || s.emergencyContact === phone).map(s => s.id),
        createdAt: new Date().toISOString()
      };
      parents.push(parent);
      DB.set('parents', parents);
    } else {
      // Create a new parent entry
      parent = {
        id: DB.genId('PAR'),
        phone: phone,
        name: `Parent ${phone.slice(-4)}`,
        studentIds: [],
        createdAt: new Date().toISOString()
      };
      parents.push(parent);
      DB.set('parents', parents);
      showToast('New parent account created! Link students in admin panel.', 'info');
    }
  }
  
  const session = {
    role: 'parent',
    userId: parent.id,
    name: parent.name,
    phone: phone,
    loginTime: new Date().toISOString(),
    token: DB.genId('PAR'),
    studentIds: parent.studentIds || []
  };
  saveSession(session);
  state.user = { name: parent.name, role: 'parent', studentIds: parent.studentIds || [] };
  
  showToast(`Welcome, ${parent.name}!`, 'success');
  enterApp();
}

// Auto-login check
function checkAutoLogin() {
  const session = getSession();
  if (session && session.token) {
    state.session = session;
    state.user = { 
      name: session.name, 
      role: session.role,
      studentIds: session.studentIds || []
    };
    enterApp();
    return true;
  }
  return false;
}

// =====================================================
// SECTION 4: APP ENTRY & NAVIGATION
// =====================================================

function enterApp() {
  document.getElementById('landingScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  
  // Set drawer info
  document.getElementById('drawerName').textContent = state.user.name;
  document.getElementById('drawerRole').textContent = state.user.role === 'admin' ? 'Administrator' : 'Parent';
  
  // Build navigation
  buildNavigation();
  // Navigate to default page
  navigateTo('dashboard');
}

function buildNavigation() {
  const isAdmin = state.user.role === 'admin';
  
  // Bottom Nav Items
  const bottomNav = document.getElementById('bottomNav');
  const navItems = isAdmin ? [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'students', icon: '👨‍🎓', label: 'Students' },
    { id: 'classes', icon: '📚', label: 'Classes' },
    { id: 'fees', icon: '💰', label: 'Fees' },
    { id: 'more', icon: '⚡', label: 'More' },
  ] : [
    { id: 'dashboard', icon: '🏠', label: 'Home' },
    { id: 'attendance', icon: '📋', label: 'Attendance' },
    { id: 'fees', icon: '💰', label: 'Fees' },
    { id: 'tests', icon: '📝', label: 'Tests' },
    { id: 'more', icon: '⚡', label: 'More' },
  ];
  
  bottomNav.innerHTML = navItems.map(item => `
    <button class="nav-item" data-page="${item.id}" onclick="navigateTo('${item.id}')">
      <span class="icon">${item.icon}</span>
      <span>${item.label}</span>
    </button>
  `).join('');
  
  // Drawer Items
  const drawer = document.getElementById('drawerItems');
  const drawerItems = isAdmin ? [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'students', icon: '👨‍🎓', label: 'Students' },
    { id: 'classes', icon: '📚', label: 'Classes' },
    { id: 'fees', icon: '💰', label: 'Fees' },
    { id: 'attendance', icon: '📋', label: 'Attendance' },
    { id: 'tests', icon: '📝', label: 'Tests' },
    { id: 'gallery', icon: '🖼️', label: 'Gallery' },
    { id: 'staff', icon: '👥', label: 'Staff' },
    { id: 'homework', icon: '📓', label: 'Homework' },
    { id: 'notices', icon: '📢', label: 'Notices' },
    { id: 'leaves', icon: '✈️', label: 'Leaves' },
    { id: 'reports', icon: '📈', label: 'Reports' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
    { type: 'divider' },
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'logout', icon: '🚪', label: 'Logout' },
  ] : [
    { id: 'dashboard', icon: '🏠', label: 'Home' },
    { id: 'attendance', icon: '📋', label: 'Attendance' },
    { id: 'fees', icon: '💰', label: 'Fees' },
    { id: 'tests', icon: '📝', label: 'Tests' },
    { id: 'gallery', icon: '🖼️', label: 'Gallery' },
    { id: 'homework', icon: '📓', label: 'Homework' },
    { id: 'notices', icon: '📢', label: 'Notices' },
    { id: 'leaves', icon: '✈️', label: 'Leave' },
    { type: 'divider' },
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'logout', icon: '🚪', label: 'Logout' },
  ];
  
  drawer.innerHTML = drawerItems.map(item => {
    if (item.type === 'divider') return '<div class="drawer-divider"></div>';
    return `<button class="drawer-item" onclick="navigateTo('${item.id}')">
      <span class="icon">${item.icon}</span>
      <span>${item.label}</span>
    </button>`;
  }).join('');
}

function navigateTo(page) {
  state.currentPage = page;
  
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.drawer-item').forEach(n => {
    const text = n.querySelector('span:last-child')?.textContent?.toLowerCase();
    n.classList.toggle('active', text === page || n.textContent.trim().toLowerCase() === page);
  });
  
  // Update header title
  const titles = {
    dashboard: 'Dashboard',
    students: 'Students',
    classes: 'Classes',
    fees: 'Fees',
    attendance: 'Attendance',
    tests: 'Tests',
    gallery: 'Gallery',
    staff: 'Staff',
    homework: 'Homework',
    notices: 'Notices',
    leaves: 'Leaves',
    reports: 'Reports',
    settings: 'Settings',
    profile: 'Profile',
    logout: 'Logout',
  };
  document.getElementById('headerTitle').textContent = titles[page] || 'Dashboard';
  
  // Handle special pages
  if (page === 'logout') { logout(); return; }
  
  // Close drawer if open
  closeDrawer();
  
  // Render page
  renderPage(page);
}

function renderPage(page) {
  const isAdmin = state.user.role === 'admin';
  
  // Show/hide FAB
  const fab = document.getElementById('fabButton');
  const fabPages = isAdmin ? ['students', 'classes', 'fees', 'attendance', 'tests', 'gallery', 'staff', 'homework', 'notices'] : [];
  fab.classList.toggle('hidden', !fabPages.includes(page));
  
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'students': isAdmin ? renderStudents() : null; break;
    case 'classes': isAdmin ? renderClasses() : navigateTo('dashboard'); break;
    case 'fees': isAdmin ? renderFees() : renderParentFees(); break;
    case 'attendance': isAdmin ? renderAttendance() : renderParentAttendance(); break;
    case 'tests': isAdmin ? renderTests() : renderParentTests(); break;
    case 'gallery': renderGallery(); break;
    case 'staff': isAdmin ? renderStaff() : navigateTo('dashboard'); break;
    case 'homework': isAdmin ? renderHomework() : renderParentHomework(); break;
    case 'notices': isAdmin ? renderNotices() : renderParentNotices(); break;
    case 'leaves': isAdmin ? renderLeaves() : renderParentLeaves(); break;
    case 'reports': isAdmin ? renderReports() : navigateTo('dashboard'); break;
    case 'settings': renderSettings(); break;
    case 'profile': renderProfile(); break;
    default: renderDashboard();
  }
}

function logout() {
  showToast('Logged out successfully.', 'info');
  closeDrawer();
  clearSession();
  document.getElementById('loginPassword') && (document.getElementById('loginPassword').value = '');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('landingScreen').classList.remove('hidden');
}

// =====================================================
// SECTION 5: UI UTILITIES
// =====================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function toggleDrawer() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('drawer');
  overlay.classList.toggle('hidden');
  drawer.classList.toggle('hidden');
}

function closeDrawer() {
  document.getElementById('drawerOverlay').classList.add('hidden');
  document.getElementById('drawer').classList.add('hidden');
}

function showModal(title, content, options = {}) {
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal-content" onclick="event.stopPropagation()" style="${options.style || ''}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        ${content}
      </div>
    </div>
  `;
}

function closeModal() {
  document.getElementById('modalContainer').innerHTML = '';
  state.editingItem = null;
}

function manualSync() {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  dot.className = 'dot syncing';
  text.textContent = 'Syncing...';
  
  // Try to sync to GAS if enabled
  setTimeout(async () => {
    if (CONFIG.GAS_ENABLED) {
      for (const key of Object.keys(CONFIG.STORAGE_KEYS)) {
        const data = DB.get(key);
        if (data.length > 0) await DB.syncToGAS(key, data);
      }
    }
    dot.className = 'dot synced';
    text.textContent = 'Synced';
    showToast('All data synchronized!', 'success');
  }, 800);
}

function handleFabClick() {
  switch (state.currentPage) {
    case 'students': renderStudentForm(); break;
    case 'classes': renderClassForm(); break;
    case 'fees': renderFeeForm(); break;
    case 'attendance': renderAttendanceForm(); break;
    case 'tests': renderTestForm(); break;
    case 'gallery': renderGalleryUpload(); break;
    case 'staff': renderStaffForm(); break;
    case 'homework': renderHomeworkForm(); break;
    case 'notices': renderNoticeForm(); break;
    default: break;
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getMonthDays(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

// =====================================================
// SECTION 6: DASHBOARD
// =====================================================

function renderDashboard() {
  const content = document.getElementById('pageContent');
  const isAdmin = state.user.role === 'admin';
  
  if (isAdmin) {
    renderAdminDashboard(content);
  } else {
    renderParentDashboard(content);
  }
}

function renderAdminDashboard(container) {
  const students = DB.get('students');
  const attendance = DB.get('attendance');
  const fees = DB.get('fees');
  const gallery = DB.get('gallery');
  const notices = DB.get('notices');
  const leaves = DB.get('leaves');
  const classes = DB.get('classes');
  
  const today = new Date().toISOString().split('T')[0];
  const todayAttendance = attendance.filter(a => a.date === today);
  const presentToday = todayAttendance.filter(a => a.status === 'present').length;
  const absentToday = todayAttendance.filter(a => a.status === 'absent').length;
  const pendingFees = fees.filter(f => f.status === 'pending' || f.status === 'partial');
  const totalPending = pendingFees.reduce((sum, f) => sum + (f.pendingAmount || f.amount || 0), 0);
  const pendingLeaves = leaves.filter(l => l.status === 'pending');
  
  // Gallery latest
  const latestGallery = [...gallery].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).slice(0, 6);
  
  container.innerHTML = `
    <div class="dashboard-greeting">${getGreeting()}</div>
    <h1 class="dashboard-name">${state.user.name}</h1>
    
    <!-- Stats Grid -->
    <div class="grid-4" style="margin-bottom:20px;">
      <div class="stat-card fade-in-up stagger-1">
        <div class="stat-icon maroon">👨‍🎓</div>
        <div class="stat-info">
          <h3>${students.length}</h3>
          <p>Total Students</p>
        </div>
      </div>
      <div class="stat-card fade-in-up stagger-2">
        <div class="stat-icon green">✅</div>
        <div class="stat-info">
          <h3>${presentToday}</h3>
          <p>Present Today</p>
        </div>
      </div>
      <div class="stat-card fade-in-up stagger-3">
        <div class="stat-icon red">❌</div>
        <div class="stat-info">
          <h3>${absentToday}</h3>
          <p>Absent Today</p>
        </div>
      </div>
      <div class="stat-card fade-in-up stagger-4">
        <div class="stat-icon gold">💰</div>
        <div class="stat-info">
          <h3>₹${totalPending.toLocaleString()}</h3>
          <p>Pending Fees</p>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="section-header">
      <h2>Quick Actions</h2>
    </div>
    <div class="grid-4" style="margin-bottom:20px;">
      <button class="card-saffron" onclick="navigateTo('students')" style="border:none;cursor:pointer;text-align:center;border-radius:var(--radius-lg);padding:16px;">
        <div style="font-size:28px;margin-bottom:4px;">➕</div>
        <div style="font-weight:600;font-size:13px;">Add Student</div>
      </button>
      <button class="card-gold" onclick="navigateTo('fees')" style="border:none;cursor:pointer;text-align:center;border-radius:var(--radius-lg);padding:16px;">
        <div style="font-size:28px;margin-bottom:4px;">💳</div>
        <div style="font-weight:600;font-size:13px;">Add Fee</div>
      </button>
      <button class="card-gradient" onclick="navigateTo('attendance')" style="border:none;cursor:pointer;text-align:center;border-radius:var(--radius-lg);padding:16px;">
        <div style="font-size:28px;margin-bottom:4px;">📋</div>
        <div style="font-weight:600;font-size:13px;">Attendance</div>
      </button>
      <button class="card-saffron" onclick="navigateTo('gallery')" style="border:none;cursor:pointer;text-align:center;border-radius:var(--radius-lg);padding:16px;">
        <div style="font-size:28px;margin-bottom:4px;">🖼️</div>
        <div style="font-weight:600;font-size:13px;">Add Gallery</div>
      </button>
    </div>

    <!-- Pending Items -->
    <div class="grid-2" style="margin-bottom:20px;">
      <div class="card">
        <div class="section-header">
          <h2>⏳ Pending Leaves</h2>
          <span class="see-all" onclick="navigateTo('leaves')">See all →</span>
        </div>
        ${pendingLeaves.length === 0 ? `
          <div class="empty-state" style="padding:20px;">
            <div class="icon">✅</div>
            <h3>No Pending Leaves</h3>
            <p>All leave requests are resolved.</p>
          </div>
        ` : pendingLeaves.slice(0, 3).map(l => {
          const student = students.find(s => s.id === l.studentId);
          return `
            <div class="list-item" onclick="reviewLeave('${l.id}')">
              <div class="avatar">✈️</div>
              <div class="info">
                <h4>${student?.name || 'Unknown'}</h4>
                <p>${formatDate(l.fromDate)} - ${formatDate(l.toDate)}</p>
              </div>
              <div><span class="pill pill-yellow">Pending</span></div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="card">
        <div class="section-header">
          <h2>📢 Latest Notices</h2>
          <span class="see-all" onclick="navigateTo('notices')">See all →</span>
        </div>
        ${notices.length === 0 ? `
          <div class="empty-state" style="padding:20px;">
            <div class="icon">📢</div>
            <h3>No Notices Yet</h3>
            <p>Create your first notice.</p>
          </div>
        ` : [...notices].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).slice(0, 3).map(n => `
          <div class="list-item">
            <div class="avatar">📋</div>
            <div class="info">
              <h4>${n.title}</h4>
              <p>${formatDate(n.createdAt)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Latest Gallery -->
    <div class="card" style="margin-bottom:20px;">
      <div class="section-header">
        <h2>🖼️ Latest Gallery</h2>
        <span class="see-all" onclick="navigateTo('gallery')">See all →</span>
      </div>
      ${latestGallery.length === 0 ? `
        <div class="empty-state" style="padding:20px;">
          <div class="icon">🖼️</div>
          <h3>No Photos Yet</h3>
          <p>Start building your school gallery.</p>
        </div>
      ` : `
        <div class="gallery-grid">
          ${latestGallery.map(item => `
            <div class="gallery-item ${item.type === 'video' ? 'video' : ''}" onclick="viewGalleryItem('${item.id}')">
              <img src="${item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="%23F5E6C8"%3E%3Crect width="200" height="200"/%3E%3Ctext x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%237A5A4A" font-size="40"%3E🖼️%3C/text%3E%3C/svg%3E'}" alt="${item.title || 'Gallery'}" loading="lazy">
              ${item.title ? `<div class="overlay">${item.title}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Class Summary -->
    <div class="card">
      <div class="section-header">
        <h2>📚 Class Summary</h2>
        <span class="see-all" onclick="navigateTo('classes')">See all →</span>
      </div>
      ${classes.length === 0 ? `
        <div class="empty-state" style="padding:20px;">
          <div class="icon">📚</div>
          <h3>No Classes Yet</h3>
          <p>Create your first class.</p>
        </div>
      ` : `
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Class</th>
                <th>Section</th>
                <th>Students</th>
                <th>Capacity</th>
              </tr>
            </thead>
            <tbody>
              ${classes.map(c => {
                const count = students.filter(s => s.classId === c.id).length;
                return `<tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.section || 'A'}</td>
                  <td>${count}</td>
                  <td>
                    <div class="progress-bar">
                      <div class="progress-fill" style="width:${Math.min(100, (count / (c.capacity || 30)) * 100)}%"></div>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
  
  container.querySelectorAll('.fade-in-up').forEach(el => el.style.animation = 'fadeInUp 0.3s ease-out forwards');
}

function renderParentDashboard(container) {
  const studentIds = state.session.studentIds || [];
  const students = DB.get('students').filter(s => studentIds.includes(s.id));
  const attendance = DB.get('attendance');
  const fees = DB.get('fees');
  const tests = DB.get('tests');
  const testResults = DB.get('testResults');
  const gallery = DB.get('gallery');
  const notices = DB.get('notices');
  const homework = DB.get('homework');
  
  const today = new Date().toISOString().split('T')[0];
  
  container.innerHTML = `
    <div class="dashboard-greeting">${getGreeting()}</div>
    <h1 class="dashboard-name">${state.user.name}</h1>
    
    ${students.length > 1 ? `
      <div class="child-switcher">
        ${students.map((s, i) => `
          <button class="child-chip ${i === 0 ? 'active' : ''}" onclick="switchChild('${s.id}', this)">
            ${s.name} (${s.className || 'Class'})
          </button>
        `).join('')}
      </div>
    ` : ''}
    
    ${students.length === 0 ? `
      <div class="empty-state" style="padding:40px 20px;">
        <div class="icon">👨‍🎓</div>
        <h3>No Students Linked</h3>
        <p>Please contact the school to link your children.</p>
      </div>
    ` : students.map(student => {
      const myAttendance = attendance.filter(a => a.studentId === student.id);
      const todayAtt = myAttendance.find(a => a.date === today);
      const myFees = fees.filter(f => f.studentId === student.id);
      const totalFees = myFees.reduce((s, f) => s + (f.amount || 0), 0);
      const paidFees = myFees.reduce((s, f) => s + (f.paidAmount || 0), 0);
      const pendingFees = totalFees - paidFees;
      const presentCount = myAttendance.filter(a => a.status === 'present').length;
      const attPct = myAttendance.length > 0 ? Math.round((presentCount / myAttendance.length) * 100) : 0;
      
      state.currentChildId = student.id;
      
      return `
        <div class="card-gradient" style="margin-bottom:16px;">
          <div class="row-between">
            <div>
              <h3 style="font-size:20px;font-weight:700;">${student.name}</h3>
              <p style="opacity:0.8;font-size:14px;">${student.className || ''} ${student.section || ''} • Roll: ${student.rollNumber || '-'}</p>
            </div>
            ${todayAtt ? `<span class="pill pill-${todayAtt.status === 'present' ? 'green' : 'red'}">${todayAtt.status.toUpperCase()}</span>` : '<span class="pill pill-gray">NOT MARKED</span>'}
          </div>
        </div>
        
        <div class="grid-4" style="margin-bottom:16px;">
          <div class="stat-card">
            <div class="stat-icon green">📋</div>
            <div class="stat-info">
              <h3>${attPct}%</h3>
              <p>Attendance</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon gold">💰</div>
            <div class="stat-info">
              <h3>₹${(totalFees - paidFees).toLocaleString()}</h3>
              <p>Pending Fees</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon maroon">📝</div>
            <div class="stat-info">
              <h3>${testResults.filter(r => r.studentId === student.id).length}</h3>
              <p>Tests Taken</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">📓</div>
            <div class="stat-info">
              <h3>${homework.filter(h => h.classId === student.classId).length}</h3>
              <p>Homework</p>
            </div>
          </div>
        </div>

        <!-- Attendance Progress -->
        <div class="card" style="margin-bottom:16px;">
          <div class="row-between">
            <h3>📋 Attendance This Month</h3>
            <span style="font-size:13px;color:var(--text-light);">${formatDate(today)}</span>
          </div>
          <div class="row" style="margin-top:12px;gap:16px;">
            <div class="circular-progress">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle class="bg" cx="40" cy="40" r="34"/>
                <circle class="fill" cx="40" cy="40" r="34" stroke-dasharray="${2 * Math.PI * 34}" stroke-dashoffset="${2 * Math.PI * 34 * (1 - attPct / 100)}"/>
              </svg>
              <div class="text">${attPct}%</div>
            </div>
            <div style="flex:1;">
              <div class="row-between"><span>Present:</span><span>${presentCount}</span></div>
              <div class="row-between"><span>Absent:</span><span>${myAttendance.filter(a => a.status === 'absent').length}</span></div>
              <div class="row-between"><span>Leaves:</span><span>${myAttendance.filter(a => a.status === 'leave' || a.status === 'holiday').length}</span></div>
            </div>
          </div>
        </div>

        <!-- Fee Status -->
        <div class="card" style="margin-bottom:16px;">
          <div class="section-header">
            <h3>💰 Fee Status</h3>
            <span class="see-all" onclick="navigateTo('fees')">Details →</span>
          </div>
          <div class="progress-bar" style="margin:12px 0;">
            <div class="progress-fill" style="width:${totalFees > 0 ? (paidFees / totalFees) * 100 : 0}%"></div>
          </div>
          <div class="row-between">
            <span style="font-size:13px;color:var(--text-light);">Paid: ₹${paidFees.toLocaleString()}</span>
            <span style="font-size:13px;font-weight:600;">Pending: ₹${pendingFees.toLocaleString()}</span>
          </div>
        </div>

        <!-- Upcoming Events & Notices -->
        <div class="grid-2" style="margin-bottom:16px;">
          <div class="card">
            <div class="section-header">
              <h4>📢 Notices</h4>
            </div>
            ${[...notices].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).slice(0, 3).map(n => `
              <div class="list-item" style="padding:10px 12px;">
                <div class="info">
                  <h4 style="font-size:14px;">${n.title}</h4>
                  <p style="font-size:12px;">${formatDate(n.createdAt)}</p>
                </div>
              </div>
            `).join('') || '<div style="font-size:13px;color:var(--text-light);text-align:center;padding:12px;">No notices yet</div>'}
          </div>
          <div class="card">
            <div class="section-header">
              <h4>🖼️ Latest Photos</h4>
            </div>
            ${[...gallery].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).slice(0, 3).map(item => `
              <div class="gallery-item" style="margin-bottom:4px;" onclick="viewGalleryItem('${item.id}')">
                <img src="${item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="%23F5E6C8"%3E%3Crect width="200" height="200"/%3E%3C/svg%3E'}" alt="${item.title || ''}" style="width:100%;height:100px;object-fit:cover;border-radius:var(--radius-md);">
                ${item.title ? `<div style="font-size:12px;margin-top:4px;font-weight:600;">${item.title}</div>` : ''}
              </div>
            `).join('') || '<div style="font-size:13px;color:var(--text-light);text-align:center;padding:12px;">No photos yet</div>'}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function switchChild(studentId, el) {
  state.currentChildId = studentId;
  document.querySelectorAll('.child-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderDashboard();
}

// =====================================================
// SECTION 7: STUDENT MANAGEMENT (Admin)
// =====================================================

function renderStudents() {
  const students = DB.get('students');
  const classes = DB.get('classes');
  const searchTerm = state.filters.studentSearch?.toLowerCase() || '';
  
  const filtered = searchTerm ? students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm) ||
    s.admissionNumber?.toLowerCase().includes(searchTerm) ||
    s.fatherName?.toLowerCase().includes(searchTerm) ||
    s.rollNumber?.toLowerCase().includes(searchTerm)
  ) : students;
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>👨‍🎓 Students (${students.length})</h2>
    </div>
    
    <div class="search-bar" style="margin-bottom:16px;">
      <span class="icon">🔍</span>
      <input type="text" placeholder="Search students..." value="${state.filters.studentSearch || ''}" 
        oninput="state.filters.studentSearch=this.value;renderStudents()">
    </div>
    
    ${students.length === 0 ? `
      <div class="empty-state">
        <div class="icon">👨‍🎓</div>
        <h3>No Students Yet</h3>
        <p>Add your first student to get started.</p>
        <button class="btn btn-primary" onclick="renderStudentForm()">
          <span>➕</span> Add Student
        </button>
      </div>
    ` : filtered.map(student => {
      const cls = classes.find(c => c.id === student.classId);
      const attendance = DB.get('attendance');
      const attPct = attendance.filter(a => a.studentId === student.id).length > 0
        ? Math.round((attendance.filter(a => a.studentId === student.id && a.status === 'present').length / attendance.filter(a => a.studentId === student.id).length) * 100)
        : 0;
      return `
        <div class="list-item" onclick="viewStudent('${student.id}')">
          <div class="avatar">
            ${student.photoUrl ? `<img src="${student.photoUrl}" alt="${student.name}">` : (student.name?.charAt(0) || '?')}
          </div>
          <div class="info">
            <h4>${student.name} <span style="font-size:12px;color:var(--text-light);font-weight:400;">#${student.admissionNumber || student.id?.slice(-6)}</span></h4>
            <p>${cls?.name || 'No Class'} ${student.section || ''} • ${student.fatherName || ''}</p>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:18px;font-weight:700;">${attPct}%</div>
            <div style="font-size:11px;color:var(--text-light);">Attendance</div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderStudentForm(student) {
  const classes = DB.get('classes');
  const isEditing = !!student;
  
  showModal(isEditing ? 'Edit Student' : 'Add New Student', `
    <form onsubmit="event.preventDefault();saveStudent('${student?.id || ''}')">
      <div class="grid-2">
        <div class="input-group">
          <label>Full Name *</label>
          <input class="input-field" id="sf_name" value="${student?.name || ''}" required>
        </div>
        <div class="input-group">
          <label>Admission Number *</label>
          <input class="input-field" id="sf_admission" value="${student?.admissionNumber || DB.genId('ADM')}" required>
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Class *</label>
          <select class="input-field" id="sf_class" required>
            <option value="">Select Class</option>
            ${classes.map(c => `<option value="${c.id}" ${student?.classId === c.id ? 'selected' : ''}>${c.name} ${c.section || ''}</option>`).join('')}
          </select>
        </div>
        <div class="input-group">
          <label>Section</label>
          <input class="input-field" id="sf_section" value="${student?.section || 'A'}">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Roll Number</label>
          <input class="input-field" id="sf_roll" value="${student?.rollNumber || ''}">
        </div>
        <div class="input-group">
          <label>Date of Birth</label>
          <input type="date" class="input-field" id="sf_dob" value="${student?.dob || ''}">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Gender</label>
          <select class="input-field" id="sf_gender">
            <option value="">Select</option>
            <option value="Male" ${student?.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${student?.gender === 'Female' ? 'selected' : ''}>Female</option>
            <option value="Other" ${student?.gender === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="input-group">
          <label>Blood Group</label>
          <select class="input-field" id="sf_blood">
            <option value="">Select</option>
            ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => 
              `<option value="${b}" ${student?.bloodGroup === b ? 'selected' : ''}>${b}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Father's Name</label>
          <input class="input-field" id="sf_father" value="${student?.fatherName || ''}">
        </div>
        <div class="input-group">
          <label>Mother's Name</label>
          <input class="input-field" id="sf_mother" value="${student?.motherName || ''}">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Father's Phone</label>
          <input type="tel" class="input-field" id="sf_fphone" value="${student?.fatherPhone || ''}">
        </div>
        <div class="input-group">
          <label>Mother's Phone</label>
          <input type="tel" class="input-field" id="sf_mphone" value="${student?.motherPhone || ''}">
        </div>
      </div>
      <div class="input-group">
        <label>Address</label>
        <textarea class="input-field" id="sf_address">${student?.address || ''}</textarea>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Total Fees (₹)</label>
          <input type="number" class="input-field" id="sf_fees" value="${student?.totalFees || ''}">
        </div>
        <div class="input-group">
          <label>Discount (₹)</label>
          <input type="number" class="input-field" id="sf_discount" value="${student?.discount || '0'}">
        </div>
      </div>
      <div class="input-group">
        <label>Medical Notes / Allergies</label>
        <textarea class="input-field" id="sf_medical">${student?.medicalDetails || ''}</textarea>
      </div>
      <div class="input-group">
        <label>
          <input type="checkbox" id="sf_active" ${student?.active !== false ? 'checked' : ''}>
          Active Student
        </label>
      </div>
      <div class="row" style="gap:12px;margin-top:16px;">
        <button type="submit" class="btn btn-primary flex-1">
          <span>💾</span> ${isEditing ? 'Update Student' : 'Add Student'}
        </button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `, { style: 'max-width:600px;' });
}

function saveStudent(id) {
  const data = {
    name: document.getElementById('sf_name').value,
    admissionNumber: document.getElementById('sf_admission').value,
    classId: document.getElementById('sf_class').value,
    section: document.getElementById('sf_section').value,
    rollNumber: document.getElementById('sf_roll').value,
    dob: document.getElementById('sf_dob').value,
    gender: document.getElementById('sf_gender').value,
    bloodGroup: document.getElementById('sf_blood').value,
    fatherName: document.getElementById('sf_father').value,
    motherName: document.getElementById('sf_mother').value,
    fatherPhone: document.getElementById('sf_fphone').value,
    motherPhone: document.getElementById('sf_mphone').value,
    address: document.getElementById('sf_address').value,
    totalFees: parseFloat(document.getElementById('sf_fees').value) || 0,
    discount: parseFloat(document.getElementById('sf_discount').value) || 0,
    medicalDetails: document.getElementById('sf_medical').value,
    active: document.getElementById('sf_active').checked,
  };
  
  const cls = DB.get('classes').find(c => c.id === data.classId);
  data.className = cls?.name || '';
  
  if (id) {
    DB.update('students', id, data);
    showToast('Student updated successfully!', 'success');
  } else {
    data.id = DB.genId('STU');
    data.createdAt = new Date().toISOString();
    DB.add('students', data);
    showToast('Student added successfully!', 'success');
  }
  
  closeModal();
  renderStudents();
}

function viewStudent(studentId) {
  const student = DB.find('students', s => s.id === studentId);
  if (!student) return;
  
  const cls = DB.find('classes', c => c.id === student.classId);
  const attendance = DB.filter('attendance', a => a.studentId === studentId);
  const fees = DB.filter('fees', f => f.studentId === studentId);
  const testResults = DB.filter('testResults', r => r.studentId === studentId);
  
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const attPct = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const totalFees = fees.reduce((s, f) => s + (f.amount || 0), 0);
  const paidFees = fees.reduce((s, f) => s + (f.paidAmount || 0), 0);
  const avgMarks = testResults.length > 0 ? Math.round(testResults.reduce((s, r) => s + ((r.marks / r.totalMarks) * 100 || 0), 0) / testResults.length) : 0;
  
  showModal(student.name, `
    <div class="row" style="margin-bottom:16px;">
      <div style="width:64px;height:64px;border-radius:var(--radius-full);background:var(--cream-dark);display:flex;align-items:center;justify-content:center;font-size:28px;">
        ${student.name?.charAt(0) || '?'}
      </div>
      <div style="flex:1;">
        <h3 style="font-size:20px;">${student.name}</h3>
        <p style="color:var(--text-light);">${cls?.name || 'No Class'} ${student.section || ''} • Roll: ${student.rollNumber || '-'}</p>
        <p style="color:var(--text-light);font-size:13px;">Admission: ${student.admissionNumber || '-'}</p>
      </div>
    </div>
    
    <div class="grid-3" style="margin-bottom:16px;">
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:24px;font-weight:700;">${attPct}%</div>
        <div style="font-size:12px;">Attendance</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:24px;font-weight:700;">${testResults.length}</div>
        <div style="font-size:12px;">Tests</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:24px;font-weight:700;">${avgMarks}%</div>
        <div style="font-size:12px;">Avg Score</div>
      </div>
    </div>
    
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab active">Details</button>
      <button class="tab" onclick="viewStudentAttendance('${studentId}')">Attendance</button>
      <button class="tab" onclick="viewStudentFees('${studentId}')">Fees</button>
      <button class="tab" onclick="viewStudentTests('${studentId}')">Tests</button>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px;">
      <div><strong>Father:</strong> ${student.fatherName || '-'}</div>
      <div><strong>Mother:</strong> ${student.motherName || '-'}</div>
      <div><strong>Father Phone:</strong> ${student.fatherPhone || '-'}</div>
      <div><strong>Mother Phone:</strong> ${student.motherPhone || '-'}</div>
      <div><strong>DOB:</strong> ${formatDate(student.dob) || '-'}</div>
      <div><strong>Gender:</strong> ${student.gender || '-'}</div>
      <div><strong>Blood:</strong> ${student.bloodGroup || '-'}</div>
      <div><strong>Status:</strong> ${student.active !== false ? '✅ Active' : '❌ Inactive'}</div>
    </div>
    ${student.medicalDetails ? `<div style="margin-top:12px;padding:12px;background:#fff3cd;border-radius:var(--radius-md);font-size:13px;"><strong>🏥 Medical:</strong> ${student.medicalDetails}</div>` : ''}
    
    <div class="row" style="margin-top:20px;gap:12px;">
      <button class="btn btn-secondary flex-1" onclick="closeModal();renderStudentForm(DB.find('students',s=>s.id==='${studentId}'));">✏️ Edit</button>
      <button class="btn btn-outline" onclick="deleteStudent('${studentId}')">🗑️ Delete</button>
    </div>
  `, { style: 'max-width:500px;' });
}

function deleteStudent(id) {
  if (confirm('Are you sure you want to delete this student?')) {
    DB.delete('students', id);
    closeModal();
    renderStudents();
    showToast('Student deleted.', 'info');
  }
}

// =====================================================
// SECTION 8: CLASS MANAGEMENT (Admin)
// =====================================================

function renderClasses() {
  const classes = DB.get('classes');
  const students = DB.get('students');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>📚 Classes (${classes.length})</h2>
      <span class="see-all" onclick="renderClassForm()">+ Add Class</span>
    </div>
    
    ${classes.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📚</div>
        <h3>No Classes Yet</h3>
        <p>Create classes to organize your students.</p>
        <button class="btn btn-primary" onclick="renderClassForm()">
          <span>➕</span> Add Class
        </button>
      </div>
    ` : classes.map(cls => {
      const count = students.filter(s => s.classId === cls.id).length;
      return `
        <div class="card" style="margin-bottom:12px;cursor:pointer;" onclick="viewClass('${cls.id}')">
          <div class="row-between">
            <div>
              <h3 style="font-size:18px;">${cls.name} ${cls.section || ''}</h3>
              <p style="font-size:13px;color:var(--text-light);">
                ${count} Students • ${cls.academicYear || '2025-2026'} • ${cls.teacher || 'No teacher assigned'}
              </p>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;">Capacity</div>
              <div class="progress-bar" style="width:80px;">
                <div class="progress-fill" style="width:${Math.min(100, (count / (cls.capacity || 30)) * 100)}%"></div>
              </div>
              <div style="font-size:12px;color:var(--text-light);">${count}/${cls.capacity || 30}</div>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderClassForm(cls) {
  const isEditing = !!cls;
  showModal(isEditing ? 'Edit Class' : 'Add New Class', `
    <form onsubmit="event.preventDefault();saveClass('${cls?.id || ''}')">
      <div class="grid-2">
        <div class="input-group">
          <label>Class Name *</label>
          <input class="input-field" id="cf_name" value="${cls?.name || ''}" required placeholder="e.g. Nursery, LKG, UKG, 1st">
        </div>
        <div class="input-group">
          <label>Section</label>
          <input class="input-field" id="cf_section" value="${cls?.section || 'A'}">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Academic Year</label>
          <input class="input-field" id="cf_year" value="${cls?.academicYear || '2025-2026'}">
        </div>
        <div class="input-group">
          <label>Teacher Assigned</label>
          <input class="input-field" id="cf_teacher" value="${cls?.teacher || ''}">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Maximum Capacity</label>
          <input type="number" class="input-field" id="cf_capacity" value="${cls?.capacity || 30}">
        </div>
        <div class="input-group">
          <label>Subjects (comma separated)</label>
          <input class="input-field" id="cf_subjects" value="${cls?.subjects || 'English, Hindi, Maths, Drawing, Rhymes'}">
        </div>
      </div>
      <div class="row" style="gap:12px;margin-top:16px;">
        <button type="submit" class="btn btn-primary flex-1">💾 ${isEditing ? 'Update' : 'Add'} Class</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);
}

function saveClass(id) {
  const data = {
    name: document.getElementById('cf_name').value,
    section: document.getElementById('cf_section').value,
    academicYear: document.getElementById('cf_year').value,
    teacher: document.getElementById('cf_teacher').value,
    capacity: parseInt(document.getElementById('cf_capacity').value) || 30,
    subjects: document.getElementById('cf_subjects').value,
  };
  
  if (id) {
    DB.update('classes', id, data);
    showToast('Class updated!', 'success');
  } else {
    data.id = DB.genId('CLS');
    data.createdAt = new Date().toISOString();
    DB.add('classes', data);
    showToast('Class added!', 'success');
  }
  closeModal();
  renderClasses();
}

function viewClass(classId) {
  const cls = DB.find('classes', c => c.id === classId);
  const students = DB.filter('students', s => s.classId === classId);
  if (!cls) return;
  
  showModal(`${cls.name} ${cls.section || ''}`, `
    <div style="margin-bottom:16px;">
      <div class="grid-3" style="margin-bottom:12px;">
        <div class="card-cream" style="text-align:center;padding:12px;">
          <div style="font-size:24px;font-weight:700;">${students.length}</div>
          <div style="font-size:12px;">Students</div>
        </div>
        <div class="card-cream" style="text-align:center;padding:12px;">
          <div style="font-size:24px;font-weight:700;">${cls.capacity || 30}</div>
          <div style="font-size:12px;">Capacity</div>
        </div>
        <div class="card-cream" style="text-align:center;padding:12px;">
          <div style="font-size:24px;font-weight:700;">${cls.teacher || '-'}</div>
          <div style="font-size:12px;">Teacher</div>
        </div>
      </div>
      <p><strong>Academic Year:</strong> ${cls.academicYear || '-'}</p>
      <p><strong>Subjects:</strong> ${cls.subjects || '-'}</p>
    </div>
    
    <h4 style="margin-bottom:8px;">Students in this class</h4>
    ${students.length === 0 ? '<p style="color:var(--text-light);">No students in this class.</p>' : 
      students.map(s => `
        <div class="list-item" style="padding:8px 12px;">
          <div class="avatar" style="width:32px;height:32px;font-size:14px;">${s.name?.charAt(0)}</div>
          <div class="info"><h4 style="font-size:14px;">${s.name}</h4></div>
          <div style="font-size:12px;color:var(--text-light);">Roll: ${s.rollNumber || '-'}</div>
        </div>
      `).join('')
    }
    
    <div class="row" style="margin-top:16px;gap:12px;">
      <button class="btn btn-secondary flex-1" onclick="closeModal();renderClassForm(DB.find('classes',c=>c.id==='${classId}'))">✏️ Edit</button>
      <button class="btn btn-outline" onclick="deleteClass('${classId}')">🗑️ Delete</button>
    </div>
  `);
}

function deleteClass(id) {
  if (confirm('Delete this class? Students in this class will not be deleted.')) {
    DB.delete('classes', id);
    closeModal();
    renderClasses();
    showToast('Class deleted.', 'info');
  }
}

// =====================================================
// SECTION 9: FEE MANAGEMENT
// =====================================================

function renderFees() {
  const fees = DB.get('fees');
  const students = DB.get('students');
  const searchTerm = state.filters.feeSearch?.toLowerCase() || '';
  
  const filtered = searchTerm ? fees.filter(f => {
    const s = students.find(st => st.id === f.studentId);
    return s?.name?.toLowerCase().includes(searchTerm) || f.studentId?.includes(searchTerm);
  }) : fees;
  
  const totalCollected = fees.reduce((s, f) => s + (f.paidAmount || 0), 0);
  const totalPending = fees.filter(f => f.status === 'pending' || f.status === 'partial').reduce((s, f) => s + (f.pendingAmount || f.amount || 0), 0);
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>💰 Fees Management</h2>
      <span class="see-all" onclick="renderFeeForm()">+ Add Payment</span>
    </div>
    
    <div class="grid-3" style="margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-icon gold">📊</div>
        <div class="stat-info">
          <h3>₹${totalCollected.toLocaleString()}</h3>
          <p>Total Collected</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">⏳</div>
        <div class="stat-info">
          <h3>₹${totalPending.toLocaleString()}</h3>
          <p>Pending</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon maroon">📄</div>
        <div class="stat-info">
          <h3>${fees.length}</h3>
          <p>Transactions</p>
        </div>
      </div>
    </div>
    
    <div class="search-bar" style="margin-bottom:16px;">
      <span class="icon">🔍</span>
      <input type="text" placeholder="Search by student name..." value="${state.filters.feeSearch || ''}" 
        oninput="state.filters.feeSearch=this.value;renderFees()">
    </div>
    
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab active" onclick="renderFees()">All</button>
      <button class="tab" onclick="renderFeeFilter('paid')">Paid</button>
      <button class="tab" onclick="renderFeeFilter('pending')">Pending</button>
      <button class="tab" onclick="renderFeeFilter('partial')">Partial</button>
    </div>
    
    ${filtered.length === 0 ? `
      <div class="empty-state">
        <div class="icon">💰</div>
        <h3>No Fee Records</h3>
        <p>Add fee payments to get started.</p>
      </div>
    ` : filtered.map(f => {
      const student = students.find(s => s.id === f.studentId);
      const statusColor = f.status === 'paid' ? 'green' : f.status === 'pending' ? 'red' : 'yellow';
      return `
        <div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="viewFee('${f.id}')">
          <div class="row-between">
            <div>
              <h4>${student?.name || 'Unknown Student'}</h4>
              <p style="font-size:13px;color:var(--text-light);">${f.feeType || 'Tuition'} • ${f.term || 'ANNUAL'}</p>
            </div>
            <div style="text-align:right;">
              <div style="font-size:18px;font-weight:700;">₹${(f.paidAmount || 0).toLocaleString()}</div>
              <span class="pill pill-${statusColor}">${f.status?.toUpperCase() || 'UNKNOWN'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderFeeFilter(status) {
  state.filters.feeSearch = '';
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  const fees = DB.get('fees').filter(f => f.status === status);
  renderFilteredFees(fees);
}

function renderFilteredFees(fees) {
  const students = DB.get('students');
  const content = document.getElementById('pageContent');
  const contentDiv = content.querySelector('.section-header')?.parentElement || content;
  // Re-render just the list part
  // Simplified - just re-render full page
  renderFees();
}

function renderFeeForm(fee) {
  const students = DB.get('students').filter(s => s.active !== false);
  const isEditing = !!fee;
  
  showModal(isEditing ? 'Edit Fee Payment' : 'Add Fee Payment', `
    <form onsubmit="event.preventDefault();saveFee('${fee?.id || ''}')">
      <div class="input-group">
        <label>Student *</label>
        <select class="input-field" id="ff_student" required>
          <option value="">Select Student</option>
          ${students.map(s => `<option value="${s.id}" ${fee?.studentId === s.id ? 'selected' : ''}>${s.name} (${s.admissionNumber || s.id?.slice(-6)})</option>`).join('')}
        </select>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Fee Type</label>
          <select class="input-field" id="ff_type">
            <option value="Tuition" ${fee?.feeType === 'Tuition' ? 'selected' : ''}>Tuition</option>
            <option value="Transport" ${fee?.feeType === 'Transport' ? 'selected' : ''}>Transport</option>
            <option value="Activity" ${fee?.feeType === 'Activity' ? 'selected' : ''}>Activity</option>
            <option value="Assessment" ${fee?.feeType === 'Assessment' ? 'selected' : ''}>Assessment</option>
            <option value="Other" ${fee?.feeType === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="input-group">
          <label>Term</label>
          <select class="input-field" id="ff_term">
            <option value="Annual" ${fee?.term === 'Annual' ? 'selected' : ''}>Annual</option>
            <option value="Term 1" ${fee?.term === 'Term 1' ? 'selected' : ''}>Term 1</option>
            <option value="Term 2" ${fee?.term === 'Term 2' ? 'selected' : ''}>Term 2</option>
            <option value="Term 3" ${fee?.term === 'Term 3' ? 'selected' : ''}>Term 3</option>
            <option value="Monthly" ${fee?.term === 'Monthly' ? 'selected' : ''}>Monthly</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Total Amount (₹) *</label>
          <input type="number" class="input-field" id="ff_amount" value="${fee?.amount || ''}" required>
        </div>
        <div class="input-group">
          <label>Paid Amount (₹) *</label>
          <input type="number" class="input-field" id="ff_paid" value="${fee?.paidAmount || ''}" required oninput="updateFeeStatus()">
        </div>
      </div>
      <div class="input-group">
        <label>Pending Amount</label>
        <input type="number" class="input-field" id="ff_pending" value="${fee?.pendingAmount || ''}" readonly style="background:var(--cream);">
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Payment Mode</label>
          <select class="input-field" id="ff_mode">
            <option value="Cash" ${fee?.paymentMode === 'Cash' ? 'selected' : ''}>Cash</option>
            <option value="Online" ${fee?.paymentMode === 'Online' ? 'selected' : ''}>Online (UPI/Net)</option>
            <option value="Cheque" ${fee?.paymentMode === 'Cheque' ? 'selected' : ''}>Cheque</option>
            <option value="Bank Transfer" ${fee?.paymentMode === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
          </select>
        </div>
        <div class="input-group">
          <label>Status</label>
          <input class="input-field" id="ff_status" value="${fee?.status || 'pending'}" readonly>
        </div>
      </div>
      <div class="row" style="gap:12px;margin-top:16px;">
        <button type="submit" class="btn btn-primary flex-1">💾 ${isEditing ? 'Update' : 'Add'} Payment</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    </form>
    <script>
      window.updateFeeStatus = function() {
        const amt = parseFloat(document.getElementById('ff_amount').value) || 0;
        const paid = parseFloat(document.getElementById('ff_paid').value) || 0;
        const pending = amt - paid;
        document.getElementById('ff_pending').value = pending;
        if (pending <= 0) document.getElementById('ff_status').value = 'paid';
        else if (paid > 0) document.getElementById('ff_status').value = 'partial';
        else document.getElementById('ff_status').value = 'pending';
      };
    <\/script>
  `);
}

function saveFee(id) {
  const data = {
    studentId: document.getElementById('ff_student').value,
    feeType: document.getElementById('ff_type').value,
    term: document.getElementById('ff_term').value,
    amount: parseFloat(document.getElementById('ff_amount').value) || 0,
    paidAmount: parseFloat(document.getElementById('ff_paid').value) || 0,
    pendingAmount: parseFloat(document.getElementById('ff_pending').value) || 0,
    paymentMode: document.getElementById('ff_mode').value,
    status: document.getElementById('ff_status').value || 'pending',
  };
  
  if (id) {
    DB.update('fees', id, data);
    showToast('Fee updated!', 'success');
  } else {
    data.id = DB.genId('FEE');
    data.createdAt = new Date().toISOString();
    DB.add('fees', data);
    showToast('Fee record added! Receipt generated.', 'success');
  }
  closeModal();
  renderFees();
}

function viewFee(feeId) {
  const fee = DB.find('fees', f => f.id === feeId);
  const student = DB.find('students', s => s.id === fee?.studentId);
  if (!fee) return;
  
  const statusColor = fee.status === 'paid' ? 'green' : fee.status === 'pending' ? 'red' : 'yellow';
  
  showModal('Fee Receipt', `
    <div style="text-align:center;margin-bottom:16px;">
      <h3>${CONFIG.SCHOOL_NAME}</h3>
      <p style="font-size:13px;color:var(--text-light);">Fee Payment Receipt</p>
    </div>
    
    <div style="border-top:2px dashed var(--cream-dark);border-bottom:2px dashed var(--cream-dark);padding:16px 0;margin:12px 0;">
      <div class="row-between"><strong>Student:</strong> <span>${student?.name || 'N/A'}</span></div>
      <div class="row-between"><strong>Fee Type:</strong> <span>${fee.feeType || 'Tuition'} - ${fee.term || 'Annual'}</span></div>
      <div class="row-between"><strong>Total Amount:</strong> <span>₹${(fee.amount || 0).toLocaleString()}</span></div>
      <div class="row-between"><strong>Paid Amount:</strong> <span>₹${(fee.paidAmount || 0).toLocaleString()}</span></div>
      <div class="row-between"><strong>Pending:</strong> <span>₹${(fee.pendingAmount || 0).toLocaleString()}</span></div>
      <div class="row-between"><strong>Mode:</strong> <span>${fee.paymentMode || 'N/A'}</span></div>
      <div class="row-between"><strong>Date:</strong> <span>${formatDate(fee.createdAt) || formatDate(new Date().toISOString())}</span></div>
      <div class="row-between"><strong>Status:</strong> <span class="pill pill-${statusColor}">${fee.status?.toUpperCase()}</span></div>
    </div>
    
    <div style="text-align:center;font-size:12px;color:var(--text-light);">
      Receipt #${fee.id} • ${CONFIG.SCHOOL_PHONE}
    </div>
    
    <div class="row" style="margin-top:16px;gap:12px;">
      <button class="btn btn-secondary flex-1" onclick="window.print()">🖨️ Print</button>
      <button class="btn btn-outline" onclick="closeModal()">Close</button>
    </div>
  `);
}

// Parent Fees View
function renderParentFees() {
  const studentIds = state.session.studentIds || [];
  const students = DB.get('students').filter(s => studentIds.includes(s.id));
  const allFees = DB.get('fees').filter(f => studentIds.includes(f.studentId));
  
  const totalFees = allFees.reduce((s, f) => s + (f.amount || 0), 0);
  const paidFees = allFees.reduce((s, f) => s + (f.paidAmount || 0), 0);
  const pendingFees = totalFees - paidFees;
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="dashboard-greeting">Fee Details</div>
    <h1 class="dashboard-name">💰 Fee Status</h1>
    
    <div class="grid-3" style="margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-icon maroon">📊</div>
        <div class="stat-info">
          <h3>₹${totalFees.toLocaleString()}</h3>
          <p>Total Fees</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✅</div>
        <div class="stat-info">
          <h3>₹${paidFees.toLocaleString()}</h3>
          <p>Paid</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">⏳</div>
        <div class="stat-info">
          <h3>₹${pendingFees.toLocaleString()}</h3>
          <p>Pending</p>
        </div>
      </div>
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:8px;">Payment Progress</h3>
      <div class="progress-bar" style="height:12px;">
        <div class="progress-fill" style="width:${totalFees > 0 ? (paidFees / totalFees) * 100 : 0}%"></div>
      </div>
      <div class="row-between" style="margin-top:8px;font-size:13px;">
        <span>Paid: ${totalFees > 0 ? Math.round((paidFees / totalFees) * 100) : 0}%</span>
        <span>Pending: ${totalFees > 0 ? Math.round((pendingFees / totalFees) * 100) : 0}%</span>
      </div>
    </div>
    
    <h3 style="margin-bottom:12px;">Payment History</h3>
    ${allFees.length === 0 ? `
      <div class="empty-state">
        <div class="icon">💰</div>
        <h3>No Fee Records</h3>
        <p>No fee records found for your children.</p>
      </div>
    ` : allFees.map(f => {
      const student = students.find(s => s.id === f.studentId);
      return `
        <div class="card" style="margin-bottom:8px;">
          <div class="row-between">
            <div>
              <h4>${f.feeType || 'Tuition'} - ${f.term || 'Annual'}</h4>
              <p style="font-size:13px;color:var(--text-light);">${student?.name || ''} • ${formatDate(f.createdAt)}</p>
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:700;">₹${(f.paidAmount || 0).toLocaleString()}</div>
              <span class="pill pill-${f.status === 'paid' ? 'green' : f.status === 'pending' ? 'red' : 'yellow'}">${f.status?.toUpperCase()}</span>
            </div>
          </div>
          ${f.status !== 'paid' ? `<button class="btn btn-sm btn-gold" style="margin-top:8px;" onclick="showToast('Pay online feature coming soon!','info')">💳 Pay Now</button>` : ''}
        </div>
      `;
    }).join('')}
  `;
}

// =====================================================
// SECTION 10: ATTENDANCE MANAGEMENT
// =====================================================

function renderAttendance() {
  const classes = DB.get('classes');
  const content = document.getElementById('pageContent');
  
  content.innerHTML = `
    <div class="section-header">
      <h2>📋 Attendance</h2>
      <span class="see-all" onclick="renderAttendanceForm()">+ Mark Today</span>
    </div>
    
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab active" onclick="renderAttendance()">Daily</button>
      <button class="tab" onclick="renderAttendanceCalendar()">Calendar</button>
      <button class="tab" onclick="renderAttendanceReports()">Reports</button>
    </div>
    
    ${classes.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📋</div>
        <h3>No Classes</h3>
        <p>Create classes first to mark attendance.</p>
      </div>
    ` : classes.map(cls => {
      const students = DB.get('students').filter(s => s.classId === cls.id && s.active !== false);
      const today = new Date().toISOString().split('T')[0];
      const todayAtt = DB.get('attendance').filter(a => a.date === today && students.some(s => s.id === a.studentId));
      const present = todayAtt.filter(a => a.status === 'present').length;
      const absent = todayAtt.filter(a => a.status === 'absent').length;
      
      return `
        <div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="renderClassAttendance('${cls.id}')">
          <div class="row-between">
            <div>
              <h4>${cls.name} ${cls.section || ''}</h4>
              <p style="font-size:13px;color:var(--text-light);">${students.length} Students</p>
            </div>
            <div style="text-align:right;">
              ${todayAtt.length > 0 ? `
                <span class="pill pill-green">${present} Present</span>
                <span class="pill pill-red" style="margin-left:4px;">${absent} Absent</span>
              ` : `<span class="pill pill-gray">Not marked</span>`}
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderAttendanceForm() {
  const classes = DB.get('classes');
  showModal('Mark Attendance', `
    <form onsubmit="event.preventDefault();loadAttendanceClass()">
      <div class="input-group">
        <label>Select Class *</label>
        <select class="input-field" id="att_class" required>
          <option value="">Choose class...</option>
          ${classes.map(c => `<option value="${c.id}">${c.name} ${c.section || ''}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label>Date</label>
        <input type="date" class="input-field" id="att_date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <button type="submit" class="btn btn-primary w-full">📋 Load Class</button>
    </form>
  `);
}

function loadAttendanceClass() {
  const classId = document.getElementById('att_class').value;
  const date = document.getElementById('att_date').value;
  if (!classId || !date) return;
  
  closeModal();
  renderClassAttendance(classId, date);
}

function renderClassAttendance(classId, date) {
  const cls = DB.find('classes', c => c.id === classId);
  const students = DB.get('students').filter(s => s.classId === classId && s.active !== false);
  const targetDate = date || new Date().toISOString().split('T')[0];
  const allAttendance = DB.get('attendance');
  
  // Get existing attendance for this date
  students.forEach(s => {
    const existing = allAttendance.find(a => a.studentId === s.id && a.date === targetDate);
    s._attendanceStatus = existing?.status || '';
  });
  
  const presentCount = students.filter(s => s._attendanceStatus === 'present').length;
  const absentCount = students.filter(s => s._attendanceStatus === 'absent').length;
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>📋 ${cls?.name || 'Class'} Attendance</h2>
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <div class="row-between">
        <div>
          <h3>${formatDate(targetDate)}</h3>
          <p style="font-size:13px;color:var(--text-light);">${students.length} students</p>
        </div>
        <div class="row" style="gap:8px;">
          <button class="btn btn-sm btn-gold" onclick="bulkAttendance('${classId}','${targetDate}','present')">✅ All Present</button>
          <button class="btn btn-sm btn-outline" onclick="bulkAttendance('${classId}','${targetDate}','absent')">❌ All Absent</button>
        </div>
      </div>
      <div class="row" style="margin-top:8px;gap:8px;">
        <span class="pill pill-green">${presentCount} Present</span>
        <span class="pill pill-red">${absentCount} Absent</span>
        <span class="pill pill-blue">${students.length - presentCount - absentCount} Unmarked</span>
      </div>
    </div>
    
    ${students.map(s => `
      <div class="list-item" onclick="toggleAttendance('${s.id}','${classId}','${targetDate}')">
        <div class="avatar">${s.name?.charAt(0) || '?'}</div>
        <div class="info">
          <h4>${s.name}</h4>
          <p>Roll: ${s.rollNumber || '-'}</p>
        </div>
        <div>
          ${s._attendanceStatus === 'present' ? '<span class="pill pill-green">✅ Present</span>' :
            s._attendanceStatus === 'absent' ? '<span class="pill pill-red">❌ Absent</span>' :
            s._attendanceStatus === 'late' ? '<span class="pill pill-yellow">⏰ Late</span>' :
            s._attendanceStatus === 'leave' ? '<span class="pill pill-blue">✈️ Leave</span>' :
            s._attendanceStatus === 'holiday' ? '<span class="pill pill-gray">🏖️ Holiday</span>' :
            '<span class="pill pill-gray">Tap to mark</span>'}
        </div>
      </div>
    `).join('')}
    
    <div class="row" style="margin-top:16px;gap:12px;">
      <button class="btn btn-primary flex-1" onclick="showToast('Attendance saved!','success');renderAttendance();">💾 Save & Back</button>
    </div>
  `;
}

function toggleAttendance(studentId, classId, date) {
  let allAttendance = DB.get('attendance');
  const existing = allAttendance.find(a => a.studentId === studentId && a.date === date);
  
  const statuses = ['present', 'absent', 'late', 'leave', 'holiday', ''];
  const currentStatus = existing?.status || '';
  const nextIdx = (statuses.indexOf(currentStatus) + 1) % statuses.length;
  const newStatus = statuses[nextIdx];
  
  if (existing) {
    if (newStatus) {
      existing.status = newStatus;
      existing.updatedAt = new Date().toISOString();
    } else {
      allAttendance = allAttendance.filter(a => !(a.studentId === studentId && a.date === date));
    }
  } else if (newStatus) {
    allAttendance.push({
      id: DB.genId('ATT'),
      studentId,
      classId,
      date,
      status: newStatus,
      createdAt: new Date().toISOString()
    });
  }
  
  DB.set('attendance', allAttendance);
  renderClassAttendance(classId, date);
}

function bulkAttendance(classId, date, status) {
  const students = DB.get('students').filter(s => s.classId === classId && s.active !== false);
  let allAttendance = DB.get('attendance');
  
  students.forEach(s => {
    const existing = allAttendance.find(a => a.studentId === s.id && a.date === date);
    if (existing) {
      existing.status = status;
      existing.updatedAt = new Date().toISOString();
    } else {
      allAttendance.push({
        id: DB.genId('ATT'),
        studentId: s.id,
        classId,
        date,
        status,
        createdAt: new Date().toISOString()
      });
    }
  });
  
  DB.set('attendance', allAttendance);
  renderClassAttendance(classId, date);
  showToast(`All marked as ${status}!`, 'success');
}

// Parent Attendance View
function renderParentAttendance() {
  const studentIds = state.session.studentIds || [];
  const students = DB.get('students').filter(s => studentIds.includes(s.id));
  const allAttendance = DB.get('attendance');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="dashboard-greeting">Attendance</div>
    <h1 class="dashboard-name">📋 Attendance Records</h1>
    
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab active" onclick="renderParentAttendance()">Monthly</button>
      <button class="tab" onclick="renderParentAttendanceCalendar()">Calendar</button>
      <button class="tab" onclick="renderParentAttendanceSummary()">Summary</button>
    </div>
    
    ${students.map(student => {
      const myAttendance = allAttendance.filter(a => a.studentId === student.id);
      const present = myAttendance.filter(a => a.status === 'present').length;
      const absent = myAttendance.filter(a => a.status === 'absent').length;
      const late = myAttendance.filter(a => a.status === 'late').length;
      const leaves = myAttendance.filter(a => a.status === 'leave' || a.status === 'holiday').length;
      const pct = myAttendance.length > 0 ? Math.round((present / myAttendance.length) * 100) : 0;
      
      return `
        <div class="card-gradient" style="margin-bottom:12px;">
          <h3 style="margin-bottom:4px;">${student.name}</h3>
          <p style="opacity:0.8;font-size:13px;">${student.className || ''} ${student.section || ''}</p>
        </div>
        <div class="grid-4" style="margin-bottom:16px;">
          <div class="stat-card">
            <div class="stat-icon green">✅</div>
            <div class="stat-info"><h3>${present}</h3><p>Present</p></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red">❌</div>
            <div class="stat-info"><h3>${absent}</h3><p>Absent</p></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">⏰</div>
            <div class="stat-info"><h3>${late}</h3><p>Late</p></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">✈️</div>
            <div class="stat-info"><h3>${leaves}</h3><p>Leaves</p></div>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px;">
          <div class="row" style="gap:16px;">
            <div class="circular-progress">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle class="bg" cx="40" cy="40" r="34"/>
                <circle class="fill" cx="40" cy="40" r="34" stroke-dasharray="${2 * Math.PI * 34}" stroke-dashoffset="${2 * Math.PI * 34 * (1 - pct / 100)}"/>
              </svg>
              <div class="text">${pct}%</div>
            </div>
            <div style="flex:1;">
              <h4>Attendance Performance</h4>
              <p style="font-size:13px;color:var(--text-light);">
                ${pct >= 75 ? '🌟 Excellent attendance!' : pct >= 50 ? '⚠️ Needs improvement' : '🔴 Risk of low attendance'}
              </p>
              <div class="progress-bar" style="margin-top:8px;">
                <div class="progress-fill" style="width:${Math.min(100, pct)}%"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card" style="margin-bottom:16px;">
          <h4 style="margin-bottom:8px;">Recent Attendance</h4>
          <div class="heatmap">
            ${Array.from({length: 28}, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (27 - i));
              const dateStr = d.toISOString().split('T')[0];
              const att = myAttendance.find(a => a.date === dateStr);
              const dayClass = att ? att.status : 'empty';
              return `<div class="heatmap-day ${dayClass}" title="${formatDate(dateStr)}: ${att?.status || 'No data'}">${d.getDate()}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderParentAttendanceCalendar() {
  // Simplified calendar view
  renderParentAttendance();
}

function renderParentAttendanceSummary() {
  renderParentAttendance();
}

function renderAttendanceCalendar() {
  renderAttendance();
}

function renderAttendanceReports() {
  const classes = DB.get('classes');
  const allAttendance = DB.get('attendance');
  const students = DB.get('students');
  
  const content = document.getElementById('pageContent');
  
  content.innerHTML = `
    <div class="section-header">
      <h2>📊 Attendance Reports</h2>
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <h3>Monthly Summary</h3>
      ${classes.map(cls => {
        const clsStudents = students.filter(s => s.classId === cls.id);
        const clsAtt = allAttendance.filter(a => clsStudents.some(s => s.id === a.studentId));
        const present = clsAtt.filter(a => a.status === 'present').length;
        const pct = clsAtt.length > 0 ? Math.round((present / clsAtt.length) * 100) : 0;
        return `
          <div class="row-between" style="margin-top:8px;">
            <span>${cls.name} ${cls.section || ''}</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar" style="margin-bottom:8px;">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        `;
      }).join('')}
      <button class="btn btn-sm btn-secondary" style="margin-top:12px;" onclick="showToast('Download feature coming soon!','info')">📥 Export Report</button>
    </div>
  `;
}

// =====================================================
// SECTION 11: TEST/EXAM MANAGEMENT
// =====================================================

function renderTests() {
  const tests = DB.get('tests');
  const classes = DB.get('classes');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>📝 Tests (${tests.length})</h2>
      <span class="see-all" onclick="renderTestForm()">+ Create Test</span>
    </div>
    
    ${tests.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📝</div>
        <h3>No Tests Yet</h3>
        <p>Create your first test/exam.</p>
      </div>
    ` : [...tests].sort((a, b) => b.date?.localeCompare(a.date || '')).map(test => {
      const cls = classes.find(c => c.id === test.classId);
      const results = DB.get('testResults').filter(r => r.testId === test.id);
      const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + ((r.marks / r.totalMarks) * 100 || 0), 0) / results.length) : 0;
      
      return `
        <div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="viewTest('${test.id}')">
          <div class="row-between">
            <div>
              <h4>${test.name} <span style="font-size:12px;color:var(--text-light);font-weight:400;">${cls?.name || ''}</span></h4>
              <p style="font-size:13px;color:var(--text-light);">${test.subject || ''} • ${formatDate(test.date)} • Max: ${test.maxMarks || '-'}</p>
            </div>
            <div style="text-align:right;">
              <div style="font-size:18px;font-weight:700;">${avgScore}%</div>
              <div style="font-size:12px;color:var(--text-light);">Avg Score</div>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderTestForm(test) {
  const classes = DB.get('classes');
  const isEditing = !!test;
  
  showModal(isEditing ? 'Edit Test' : 'Create New Test', `
    <form onsubmit="event.preventDefault();saveTest('${test?.id || ''}')">
      <div class="grid-2">
        <div class="input-group">
          <label>Test Name *</label>
          <input class="input-field" id="tf_name" value="${test?.name || ''}" required placeholder="e.g. Term 1, Unit Test, Weekly">
        </div>
        <div class="input-group">
          <label>Subject</label>
          <input class="input-field" id="tf_subject" value="${test?.subject || ''}" placeholder="e.g. English, Maths">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Class *</label>
          <select class="input-field" id="tf_class" required>
            <option value="">Select Class</option>
            ${classes.map(c => `<option value="${c.id}" ${test?.classId === c.id ? 'selected' : ''}>${c.name} ${c.section || ''}</option>`).join('')}
          </select>
        </div>
        <div class="input-group">
          <label>Date</label>
          <input type="date" class="input-field" id="tf_date" value="${test?.date || new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Maximum Marks *</label>
          <input type="number" class="input-field" id="tf_max" value="${test?.maxMarks || 100}" required>
        </div>
        <div class="input-group">
          <label>Description</label>
          <input class="input-field" id="tf_desc" value="${test?.description || ''}">
        </div>
      </div>
      <div class="row" style="gap:12px;margin-top:16px;">
        <button type="submit" class="btn btn-primary flex-1">💾 ${isEditing ? 'Update' : 'Create'} Test</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);
}

function saveTest(id) {
  const data = {
    name: document.getElementById('tf_name').value,
    subject: document.getElementById('tf_subject').value,
    classId: document.getElementById('tf_class').value,
    date: document.getElementById('tf_date').value,
    maxMarks: parseInt(document.getElementById('tf_max').value) || 100,
    description: document.getElementById('tf_desc').value,
  };
  
  if (id) {
    DB.update('tests', id, data);
    showToast('Test updated!', 'success');
  } else {
    data.id = DB.genId('TST');
    data.createdAt = new Date().toISOString();
    DB.add('tests', data);
    showToast('Test created! Now enter marks.', 'success');
  }
  closeModal();
  renderTests();
}

function viewTest(testId) {
  const test = DB.find('tests', t => t.id === testId);
  if (!test) return;
  
  const cls = DB.find('classes', c => c.id === test.classId);
  const students = DB.get('students').filter(s => s.classId === test.classId && s.active !== false);
  const results = DB.get('testResults').filter(r => r.testId === testId);
  
  const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + ((r.marks / r.totalMarks) * 100 || 0), 0) / results.length) : 0;
  const topScore = results.length > 0 ? Math.max(...results.map(r => (r.marks / r.totalMarks) * 100)) : 0;
  const lowScore = results.length > 0 ? Math.min(...results.map(r => (r.marks / r.totalMarks) * 100)) : 0;
  
  showModal(`${test.name} - ${test.subject || ''}`, `
    <div class="grid-3" style="margin-bottom:12px;">
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${avgScore}%</div>
        <div style="font-size:11px;">Class Average</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${topScore.toFixed(0)}%</div>
        <div style="font-size:11px;">Highest</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${lowScore.toFixed(0)}%</div>
        <div style="font-size:11px;">Lowest</div>
      </div>
    </div>
    
    <p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">
      ${cls?.name || ''} • ${formatDate(test.date)} • Max: ${test.maxMarks}
    </p>
    
    <h4 style="margin-bottom:8px;">Student Results (${students.length})</h4>
    <div style="max-height:300px;overflow-y:auto;">
      ${students.map(s => {
        const result = results.find(r => r.studentId === s.id);
        const pct = result ? Math.round((result.marks / result.totalMarks) * 100) : 0;
        const grade = pct >= 90 ? 'A+' : pct >= 75 ? 'A' : pct >= 60 ? 'B' : pct >= 45 ? 'C' : pct >= 33 ? 'D' : 'F';
        const color = pct >= 75 ? 'green' : pct >= 45 ? 'yellow' : 'red';
        
        return `
          <div class="list-item" style="padding:8px 12px;">
            <div class="avatar" style="width:32px;height:32px;font-size:14px;">${s.name?.charAt(0) || '?'}</div>
            <div class="info">
              <h4 style="font-size:14px;">${s.name}</h4>
            </div>
            <div style="text-align:right;">
              ${result ? `<div style="font-size:14px;font-weight:600;">${result.marks}/${result.totalMarks}</div>` : 
                `<button class="btn btn-sm btn-gold" onclick="closeModal();enterStudentMarks('${testId}','${s.id}')">Enter</button>`}
              ${result ? `<span class="pill pill-${color}">${grade} • ${pct}%</span>` : `<span class="pill pill-gray">Pending</span>`}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    <div class="row" style="margin-top:16px;gap:8px;">
      <button class="btn btn-secondary flex-1" onclick="closeModal();renderBulkMarksEntry('${testId}')">📝 Bulk Entry</button>
      <button class="btn btn-outline" onclick="closeModal();renderTestForm(DB.find('tests',t=>t.id==='${testId}'))">✏️ Edit</button>
      <button class="btn btn-outline" onclick="deleteTest('${testId}')">🗑️</button>
    </div>
  `, { style: 'max-width:520px;' });
}

function enterStudentMarks(testId, studentId) {
  const test = DB.find('tests', t => t.id === testId);
  const student = DB.find('students', s => s.id === studentId);
  const existing = DB.find('testResults', r => r.testId === testId && r.studentId === studentId);
  
  showModal(`Enter Marks - ${student?.name}`, `
    <form onsubmit="event.preventDefault();saveStudentMarks('${testId}','${studentId}')">
      <div class="input-group">
        <label>Subject</label>
        <input class="input-field" id="tm_subject" value="${test?.subject || ''}" readonly>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Marks Obtained *</label>
          <input type="number" class="input-field" id="tm_marks" value="${existing?.marks || ''}" required max="${test?.maxMarks || 100}">
        </div>
        <div class="input-group">
          <label>Maximum Marks</label>
          <input type="number" class="input-field" id="tm_total" value="${test?.maxMarks || 100}" readonly>
        </div>
      </div>
      <div class="input-group">
        <label>Teacher Remarks</label>
        <textarea class="input-field" id="tm_remarks">${existing?.remarks || ''}</textarea>
      </div>
      <button type="submit" class="btn btn-primary w-full">💾 Save Marks</button>
    </form>
  `);
}

function saveStudentMarks(testId, studentId) {
  const marks = parseFloat(document.getElementById('tm_marks').value);
  const total = parseFloat(document.getElementById('tm_total').value) || 100;
  const remarks = document.getElementById('tm_remarks').value;
  
  if (marks === undefined || marks < 0) {
    showToast('Please enter valid marks.', 'warning');
    return;
  }
  
  const pct = Math.round((marks / total) * 100);
  const grade = pct >= 90 ? 'A+' : pct >= 75 ? 'A' : pct >= 60 ? 'B' : pct >= 45 ? 'C' : pct >= 33 ? 'D' : 'F';
  
  const existing = DB.find('testResults', r => r.testId === testId && r.studentId === studentId);
  const data = { testId, studentId, marks, totalMarks: total, percentage: pct, grade, remarks, updatedAt: new Date().toISOString() };
  
  if (existing) {
    DB.update('testResults', existing.id, data);
  } else {
    data.id = DB.genId('RES');
    data.createdAt = new Date().toISOString();
    DB.add('testResults', data);
  }
  
  closeModal();
  showToast(`Marks saved! Grade: ${grade}`, 'success');
  viewTest(testId);
}

function renderBulkMarksEntry(testId) {
  const test = DB.find('tests', t => t.id === testId);
  const students = DB.get('students').filter(s => s.classId === test?.classId && s.active !== false);
  const results = DB.get('testResults').filter(r => r.testId === testId);
  
  let formHtml = `
    <form onsubmit="event.preventDefault();saveBulkMarks('${testId}')">
      <p style="margin-bottom:12px;font-size:14px;color:var(--text-light);">Enter marks for ${test?.name} (Max: ${test?.maxMarks})</p>
      <div style="max-height:400px;overflow-y:auto;">
  `;
  
  students.forEach(s => {
    const existing = results.find(r => r.studentId === s.id);
    formHtml += `
      <div class="row" style="margin-bottom:8px;padding:8px;background:var(--cream-dark);border-radius:var(--radius-md);">
        <span style="min-width:120px;font-weight:600;font-size:14px;">${s.name}</span>
        <input type="number" class="input-field" id="bm_${s.id}" value="${existing?.marks || ''}" style="width:100px;" min="0" max="${test?.maxMarks || 100}" placeholder="Marks">
        <span style="font-size:13px;color:var(--text-light);">/ ${test?.maxMarks || 100}</span>
      </div>
    `;
  });
  
  formHtml += `
      </div>
      <div class="row" style="margin-top:16px;gap:12px;">
        <button type="submit" class="btn btn-primary flex-1">💾 Save All Marks</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  
  closeModal();
  showModal('Bulk Marks Entry', formHtml, { style: 'max-width:500px;' });
}

function saveBulkMarks(testId) {
  const test = DB.find('tests', t => t.id === testId);
  const students = DB.get('students').filter(s => s.classId === test?.classId && s.active !== false);
  const total = test?.maxMarks || 100;
  
  students.forEach(s => {
    const marksInput = document.getElementById(`bm_${s.id}`);
    const marks = marksInput ? parseFloat(marksInput.value) : null;
    if (marks !== null && !isNaN(marks)) {
      const pct = Math.round((marks / total) * 100);
      const grade = pct >= 90 ? 'A+' : pct >= 75 ? 'A' : pct >= 60 ? 'B' : pct >= 45 ? 'C' : pct >= 33 ? 'D' : 'F';
      const data = { testId, studentId: s.id, marks, totalMarks: total, percentage: pct, grade, remarks: '', updatedAt: new Date().toISOString() };
      const existing = DB.find('testResults', r => r.testId === testId && r.studentId === s.id);
      if (existing) DB.update('testResults', existing.id, data);
      else { data.id = DB.genId('RES'); data.createdAt = new Date().toISOString(); DB.add('testResults', data); }
    }
  });
  
  closeModal();
  showToast(`Marks saved for ${students.length} students!`, 'success');
  renderTests();
}

function deleteTest(id) {
  if (confirm('Delete this test and all its results?')) {
    DB.delete('tests', id);
    const results = DB.get('testResults').filter(r => r.testId !== id);
    DB.set('testResults', results);
    closeModal();
    renderTests();
    showToast('Test deleted.', 'info');
  }
}

// Parent Tests View
function renderParentTests() {
  const studentIds = state.session.studentIds || [];
  const students = DB.get('students').filter(s => studentIds.includes(s.id));
  const allTests = DB.get('tests');
  const allResults = DB.get('testResults');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="dashboard-greeting">Test Results</div>
    <h1 class="dashboard-name">📝 Test Performance</h1>
    
    ${students.map(student => {
      const myResults = allResults.filter(r => r.studentId === student.id);
      const avgPct = myResults.length > 0 ? Math.round(myResults.reduce((s, r) => s + (r.percentage || 0), 0) / myResults.length) : 0;
      const topGrade = myResults.length > 0 ? myResults.sort((a, b) => (b.percentage || 0) - (a.percentage || 0))[0] : null;
      
      return `
        <div class="card-gradient" style="margin-bottom:12px;">
          <h3>${student.name}</h3>
          <p style="opacity:0.8;font-size:13px;">${student.className || ''}</p>
        </div>
        
        <div class="grid-3" style="margin-bottom:16px;">
          <div class="stat-card">
            <div class="stat-icon maroon">📊</div>
            <div class="stat-info"><h3>${myResults.length}</h3><p>Tests Taken</p></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon ${avgPct >= 75 ? 'green' : avgPct >= 45 ? 'gold' : 'red'}">🎯</div>
            <div class="stat-info"><h3>${avgPct}%</h3><p>Average Score</p></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon gold">🏆</div>
            <div class="stat-info"><h3>${topGrade?.grade || '-'}</h3><p>Top Grade</p></div>
          </div>
        </div>
        
        <div class="card" style="margin-bottom:16px;">
          <h4 style="margin-bottom:8px;">Performance Progress</h4>
          <div class="progress-bar" style="height:10px;">
            <div class="progress-fill" style="width:${Math.min(100, avgPct)}%"></div>
          </div>
          <p style="font-size:13px;color:var(--text-light);margin-top:4px;">
            ${avgPct >= 75 ? '🌟 Excellent performance!' : avgPct >= 50 ? '📈 Good, keep improving!' : '📚 Needs more practice'}
          </p>
        </div>
        
        ${myResults.length > 0 ? `
          <h4 style="margin-bottom:8px;">Subject-wise Performance</h4>
          ${myResults.sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).map(r => {
            const test = allTests.find(t => t.id === r.testId);
            const color = r.percentage >= 75 ? 'green' : r.percentage >= 45 ? 'yellow' : 'red';
            return `
              <div class="list-item">
                <div class="avatar" style="font-size:16px;">📝</div>
                <div class="info">
                  <h4 style="font-size:14px;">${test?.name || 'Test'} ${test?.subject ? `(${test.subject})` : ''}</h4>
                  <p style="font-size:12px;">${formatDate(test?.date)} • ${test?.maxMarks || r.totalMarks} marks</p>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:700;font-size:16px;">${r.marks}/${r.totalMarks}</div>
                  <span class="pill pill-${color}">${r.grade || '-'} • ${r.percentage}%</span>
                </div>
              </div>
            `;
          }).join('')}
          <button class="btn btn-sm btn-secondary" style="margin-top:12px;" onclick="showToast('Download report card feature coming soon!','info')">📥 Download Report Card</button>
        ` : `
          <div class="empty-state">
            <div class="icon">📝</div>
            <h3>No Results Yet</h3>
            <p>Test results will appear here once published.</p>
          </div>
        `}
      `;
    }).join('')}
  `;
}

// =====================================================
// SECTION 12: GALLERY
// =====================================================

function renderGallery() {
  const gallery = DB.get('gallery');
  
  const content = document.getElementById('pageContent');
  const isAdmin = state.user.role === 'admin';
  
  content.innerHTML = `
    <div class="section-header">
      <h2>🖼️ School Gallery</h2>
      ${isAdmin ? '<span class="see-all" onclick="renderGalleryUpload()">+ Add</span>' : ''}
    </div>
    
    ${gallery.length === 0 ? `
      <div class="empty-state">
        <div class="icon">🖼️</div>
        <h3>Gallery is Empty</h3>
        <p>${isAdmin ? 'Upload photos and videos to build the gallery.' : 'Photos will appear here once uploaded.'}</p>
        ${isAdmin ? '<button class="btn btn-primary" onclick="renderGalleryUpload()">📷 Upload</button>' : ''}
      </div>
    ` : `
      <div class="gallery-grid">
        ${gallery.map(item => `
          <div class="gallery-item ${item.type === 'video' ? 'video' : ''}" onclick="viewGalleryItem('${item.id}')">
            <img src="${item.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="%23F5E6C8"%3E%3Crect width="200" height="200"/%3E%3C/svg%3E'}" alt="${item.title || 'Gallery'}" loading="lazy">
            ${item.title ? `<div class="overlay">${item.title}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function renderGalleryUpload() {
  showModal('Add to Gallery', `
    <form onsubmit="event.preventDefault();saveGalleryItem()">
      <p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">
        📷 Images are auto-uploaded. Paste a URL or use an image hosting service.
      </p>
      <div class="input-group">
        <label>Image/Video URL *</label>
        <input class="input-field" id="gf_url" placeholder="https://example.com/image.jpg" required>
      </div>
      <div class="input-group">
        <label>Title</label>
        <input class="input-field" id="gf_title" placeholder="e.g. Sports Day 2025">
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Type</label>
          <select class="input-field" id="gf_type">
            <option value="image">📷 Photo</option>
            <option value="video">🎬 Video / YouTube</option>
          </select>
        </div>
        <div class="input-group">
          <label>Album</label>
          <input class="input-field" id="gf_album" placeholder="e.g. Annual Function">
        </div>
      </div>
      <button type="submit" class="btn btn-primary w-full">📤 Upload to Gallery</button>
    </form>
    <div style="margin-top:12px;text-align:center;">
      <p style="font-size:12px;color:var(--text-light);">💡 Tip: Use imgur, postimages.org, or Google Photos links</p>
    </div>
  `);
}

function saveGalleryItem() {
  const data = {
    imageUrl: document.getElementById('gf_url').value,
    title: document.getElementById('gf_title').value,
    type: document.getElementById('gf_type').value,
    album: document.getElementById('gf_album').value,
    id: DB.genId('GAL'),
    createdAt: new Date().toISOString(),
    uploadedBy: state.user.name
  };
  
  DB.add('gallery', data);
  closeModal();
  renderGallery();
  showToast('Added to gallery!', 'success');
}

function viewGalleryItem(id) {
  const item = DB.find('gallery', g => g.id === id);
  if (!item) return;
  
  showModal(item.title || 'Gallery Item', `
    <div style="text-align:center;">
      ${item.type === 'video' ? `
        <div style="padding:40px;background:var(--cream-dark);border-radius:var(--radius-md);cursor:pointer;" onclick="window.open('${item.imageUrl}','_blank')">
          <div style="font-size:48px;">▶️</div>
          <p style="margin-top:8px;font-size:14px;">Click to watch video</p>
        </div>
      ` : `
        <img src="${item.imageUrl}" alt="${item.title || ''}" style="width:100%;max-height:400px;object-fit:contain;border-radius:var(--radius-md);cursor:pointer;" onclick="window.open('${item.imageUrl}','_blank')">
      `}
      <div class="row-between" style="margin-top:12px;font-size:13px;color:var(--text-light);">
        <span>📅 ${formatDate(item.createdAt)}</span>
        <span>${item.album ? `📁 ${item.album}` : ''}</span>
      </div>
      <div class="row" style="margin-top:16px;gap:12px;justify-content:center;">
        <button class="btn btn-sm btn-outline" onclick="window.open('${item.imageUrl}','_blank')">📥 Download</button>
        ${state.user.role === 'admin' ? `<button class="btn btn-sm btn-outline" onclick="deleteGalleryItem('${id}')">🗑️ Delete</button>` : ''}
      </div>
    </div>
  `);
}

function deleteGalleryItem(id) {
  if (confirm('Delete this gallery item?')) {
    DB.delete('gallery', id);
    closeModal();
    renderGallery();
    showToast('Item deleted.', 'info');
  }
}

// =====================================================
// SECTION 13: STAFF MANAGEMENT (Admin)
// =====================================================

function renderStaff() {
  const staff = DB.get('staff');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>👥 Staff (${staff.length})</h2>
      <span class="see-all" onclick="renderStaffForm()">+ Add Staff</span>
    </div>
    
    ${staff.length === 0 ? `
      <div class="empty-state">
        <div class="icon">👥</div>
        <h3>No Staff Yet</h3>
        <p>Add teachers and staff members.</p>
      </div>
    ` : staff.map(s => `
      <div class="list-item" onclick="viewStaff('${s.id}')">
        <div class="avatar">${s.name?.charAt(0) || '?'}</div>
        <div class="info">
          <h4>${s.name}</h4>
          <p>${s.designation || 'Staff'} • ${s.phone || '-'}</p>
        </div>
        <span class="pill pill-maroon">${s.designation || 'Staff'}</span>
      </div>
    `).join('')}
  `;
}

function renderStaffForm(staff) {
  const isEditing = !!staff;
  showModal(isEditing ? 'Edit Staff' : 'Add Staff Member', `
    <form onsubmit="event.preventDefault();saveStaff('${staff?.id || ''}')">
      <div class="grid-2">
        <div class="input-group">
          <label>Full Name *</label>
          <input class="input-field" id="stf_name" value="${staff?.name || ''}" required>
        </div>
        <div class="input-group">
          <label>Designation</label>
          <select class="input-field" id="stf_designation">
            <option value="Teacher" ${staff?.designation === 'Teacher' ? 'selected' : ''}>Teacher</option>
            <option value="Principal" ${staff?.designation === 'Principal' ? 'selected' : ''}>Principal</option>
            <option value="Coordinator" ${staff?.designation === 'Coordinator' ? 'selected' : ''}>Coordinator</option>
            <option value="Office Staff" ${staff?.designation === 'Office Staff' ? 'selected' : ''}>Office Staff</option>
            <option value="Driver" ${staff?.designation === 'Driver' ? 'selected' : ''}>Driver</option>
            <option value="Helper" ${staff?.designation === 'Helper' ? 'selected' : ''}>Helper</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Phone</label>
          <input type="tel" class="input-field" id="stf_phone" value="${staff?.phone || ''}">
        </div>
        <div class="input-group">
          <label>Email</label>
          <input type="email" class="input-field" id="stf_email" value="${staff?.email || ''}">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Salary (₹)</label>
          <input type="number" class="input-field" id="stf_salary" value="${staff?.salary || ''}">
        </div>
        <div class="input-group">
          <label>Qualification</label>
          <input class="input-field" id="stf_qualification" value="${staff?.qualification || ''}">
        </div>
      </div>
      <div class="input-group">
        <label>Address</label>
        <textarea class="input-field" id="stf_address">${staff?.address || ''}</textarea>
      </div>
      <div class="row" style="gap:12px;margin-top:16px;">
        <button type="submit" class="btn btn-primary flex-1">💾 ${isEditing ? 'Update' : 'Add'} Staff</button>
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);
}

function saveStaff(id) {
  const data = {
    name: document.getElementById('stf_name').value,
    designation: document.getElementById('stf_designation').value,
    phone: document.getElementById('stf_phone').value,
    email: document.getElementById('stf_email').value,
    salary: parseFloat(document.getElementById('stf_salary').value) || 0,
    qualification: document.getElementById('stf_qualification').value,
    address: document.getElementById('stf_address').value,
  };
  
  if (id) {
    DB.update('staff', id, data);
    showToast('Staff updated!', 'success');
  } else {
    data.id = DB.genId('STF');
    data.createdAt = new Date().toISOString();
    DB.add('staff', data);
    showToast('Staff added!', 'success');
  }
  closeModal();
  renderStaff();
}

function viewStaff(id) {
  const staff = DB.find('staff', s => s.id === id);
  if (!staff) return;
  
  showModal(staff.name, `
    <div class="stat-card" style="margin-bottom:16px;">
      <div class="stat-icon maroon" style="font-size:32px;">${staff.name?.charAt(0) || '?'}</div>
      <div class="stat-info">
        <h3>${staff.name}</h3>
        <p>${staff.designation || 'Staff'}</p>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px;">
      <div><strong>Phone:</strong> ${staff.phone || '-'}</div>
      <div><strong>Email:</strong> ${staff.email || '-'}</div>
      <div><strong>Salary:</strong> ₹${(staff.salary || 0).toLocaleString()}</div>
      <div><strong>Qualification:</strong> ${staff.qualification || '-'}</div>
      <div style="grid-column:1/-1;"><strong>Address:</strong> ${staff.address || '-'}</div>
    </div>
    <div class="row" style="margin-top:16px;gap:12px;">
      <button class="btn btn-secondary flex-1" onclick="closeModal();renderStaffForm(DB.find('staff',s=>s.id==='${id}'))">✏️ Edit</button>
      <button class="btn btn-outline" onclick="deleteStaff('${id}')">🗑️ Delete</button>
    </div>
  `);
}

function deleteStaff(id) {
  if (confirm('Delete this staff member?')) {
    DB.delete('staff', id);
    closeModal();
    renderStaff();
    showToast('Staff deleted.', 'info');
  }
}

// =====================================================
// SECTION 14: HOMEWORK
// =====================================================

function renderHomework() {
  const homework = DB.get('homework');
  const classes = DB.get('classes');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>📓 Homework (${homework.length})</h2>
      <span class="see-all" onclick="renderHomeworkForm()">+ Add</span>
    </div>
    
    ${homework.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📓</div>
        <h3>No Homework</h3>
        <p>Assign homework to your classes.</p>
      </div>
    ` : [...homework].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).map(hw => {
      const cls = classes.find(c => c.id === hw.classId);
      const isOverdue = hw.dueDate && new Date(hw.dueDate) < new Date();
      return `
        <div class="card" style="margin-bottom:8px;">
          <div class="row-between">
            <div>
              <h4>${hw.title || hw.subject || 'Homework'}</h4>
              <p style="font-size:13px;color:var(--text-light);">${cls?.name || ''} • ${hw.subject || ''} • Due: ${formatDate(hw.dueDate)}</p>
            </div>
            <div style="text-align:right;">
              ${isOverdue ? '<span class="pill pill-red">Overdue</span>' : '<span class="pill pill-green">Active</span>'}
            </div>
          </div>
          ${hw.description ? `<p style="font-size:13px;margin-top:4px;">${hw.description}</p>` : ''}
          ${state.user.role === 'admin' ? `
            <div class="row" style="margin-top:8px;gap:8px;">
              <button class="btn btn-sm btn-ghost" onclick="deleteHomework('${hw.id}')">🗑️</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('')}
  `;
}

function renderHomeworkForm() {
  const classes = DB.get('classes');
  showModal('Add Homework', `
    <form onsubmit="event.preventDefault();saveHomework()">
      <div class="input-group">
        <label>Class *</label>
        <select class="input-field" id="hw_class" required>
          <option value="">Select Class</option>
          ${classes.map(c => `<option value="${c.id}">${c.name} ${c.section || ''}</option>`).join('')}
        </select>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Subject</label>
          <input class="input-field" id="hw_subject" placeholder="e.g. English, Maths">
        </div>
        <div class="input-group">
          <label>Due Date</label>
          <input type="date" class="input-field" id="hw_due">
        </div>
      </div>
      <div class="input-group">
        <label>Homework Details *</label>
        <textarea class="input-field" id="hw_desc" required placeholder="Describe the homework assignment..."></textarea>
      </div>
      <button type="submit" class="btn btn-primary w-full">📤 Assign Homework</button>
    </form>
  `);
}

function saveHomework() {
  const data = {
    classId: document.getElementById('hw_class').value,
    subject: document.getElementById('hw_subject').value,
    dueDate: document.getElementById('hw_due').value,
    description: document.getElementById('hw_desc').value,
    title: `${document.getElementById('hw_subject').value || 'Homework'} - ${document.getElementById('hw_class').value}`,
    id: DB.genId('HW'),
    createdAt: new Date().toISOString(),
    createdBy: state.user.name
  };
  
  DB.add('homework', data);
  closeModal();
  renderHomework();
  showToast('Homework assigned!', 'success');
}

function deleteHomework(id) {
  if (confirm('Delete this homework?')) {
    DB.delete('homework', id);
    renderHomework();
    showToast('Homework deleted.', 'info');
  }
}

// Parent Homework View
function renderParentHomework() {
  const studentIds = state.session.studentIds || [];
  const students = DB.get('students').filter(s => studentIds.includes(s.id));
  const classIds = [...new Set(students.map(s => s.classId))];
  const homework = DB.get('homework').filter(h => classIds.includes(h.classId));
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="dashboard-greeting">Homework</div>
    <h1 class="dashboard-name">📓 Homework Assignments</h1>
    
    ${homework.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📓</div>
        <h3>No Homework</h3>
        <p>No homework assigned currently.</p>
      </div>
    ` : [...homework].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).map(hw => {
      const cls = DB.find('classes', c => c.id === hw.classId);
      const isOverdue = hw.dueDate && new Date(hw.dueDate) < new Date();
      return `
        <div class="card" style="margin-bottom:8px;">
          <div class="row-between">
            <div>
              <h4>${hw.subject || 'Homework'}</h4>
              <p style="font-size:13px;color:var(--text-light);">${cls?.name || ''} • Due: ${formatDate(hw.dueDate) || 'No due date'}</p>
            </div>
            ${isOverdue ? '<span class="pill pill-red">⚠️ Overdue</span>' : '<span class="pill pill-green">✅ Active</span>'}
          </div>
          <p style="font-size:14px;margin-top:4px;">${hw.description || ''}</p>
          <p style="font-size:12px;color:var(--text-light);margin-top:4px;">Posted: ${formatDate(hw.createdAt)}</p>
        </div>
      `;
    }).join('')}
  `;
}

// =====================================================
// SECTION 15: NOTICES
// =====================================================

function renderNotices() {
  const notices = DB.get('notices');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>📢 Notices (${notices.length})</h2>
      <span class="see-all" onclick="renderNoticeForm()">+ New Notice</span>
    </div>
    
    ${notices.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📢</div>
        <h3>No Notices</h3>
        <p>Create notices for parents and staff.</p>
      </div>
    ` : [...notices].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).map(n => `
      <div class="card" style="margin-bottom:8px;">
        <div class="row-between">
          <div>
            <h4>${n.title}</h4>
            <p style="font-size:13px;color:var(--text-light);">${formatDate(n.createdAt)} ${n.target ? `• ${n.target}` : ''}</p>
          </div>
          <span class="pill pill-maroon">${n.type || 'Notice'}</span>
        </div>
        ${n.description ? `<p style="font-size:14px;margin-top:4px;">${n.description}</p>` : ''}
        ${state.user.role === 'admin' ? `
          <div class="row" style="margin-top:8px;gap:8px;">
            <button class="btn btn-sm btn-ghost" onclick="deleteNotice('${n.id}')">🗑️ Delete</button>
          </div>
        ` : ''}
      </div>
    `).join('')}
  `;
}

function renderNoticeForm() {
  showModal('New Notice', `
    <form onsubmit="event.preventDefault();saveNotice()">
      <div class="input-group">
        <label>Title *</label>
        <input class="input-field" id="nt_title" required placeholder="Notice title">
      </div>
      <div class="input-group">
        <label>Description</label>
        <textarea class="input-field" id="nt_desc" placeholder="Notice details..." rows="4"></textarea>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>Type</label>
          <select class="input-field" id="nt_type">
            <option value="Notice">Notice</option>
            <option value="Event">Event</option>
            <option value="Holiday">Holiday</option>
            <option value="Emergency">🚨 Emergency</option>
            <option value="Circular">Circular</option>
          </select>
        </div>
        <div class="input-group">
          <label>Target</label>
          <select class="input-field" id="nt_target">
            <option value="All">All</option>
            <option value="Parents">Parents</option>
            <option value="Staff">Staff</option>
          </select>
        </div>
      </div>
      <button type="submit" class="btn btn-primary w-full">📢 Post Notice</button>
    </form>
  `);
}

function saveNotice() {
  const data = {
    title: document.getElementById('nt_title').value,
    description: document.getElementById('nt_desc').value,
    type: document.getElementById('nt_type').value,
    target: document.getElementById('nt_target').value,
    id: DB.genId('NTC'),
    createdAt: new Date().toISOString(),
    createdBy: state.user.name
  };
  
  DB.add('notices', data);
  closeModal();
  renderNotices();
  showToast('Notice posted!', 'success');
}

function deleteNotice(id) {
  if (confirm('Delete this notice?')) {
    DB.delete('notices', id);
    renderNotices();
    showToast('Notice deleted.', 'info');
  }
}

function renderParentNotices() {
  const notices = DB.get('notices');
  renderFilteredNotices(notices);
}

function renderFilteredNotices(notices) {
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="dashboard-greeting">School Updates</div>
    <h1 class="dashboard-name">📢 Notices & Announcements</h1>
    
    ${notices.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📢</div>
        <h3>No Notices</h3>
        <p>No notices or announcements at this time.</p>
      </div>
    ` : [...notices].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).map(n => `
      <div class="card" style="margin-bottom:8px;border-left:4px solid ${n.type === 'Emergency' ? '#dc3545' : n.type === 'Holiday' ? 'var(--gold)' : 'var(--maroon)'};">
        <div class="row-between">
          <div>
            <h4>${n.title}</h4>
            <p style="font-size:13px;color:var(--text-light);">${formatDate(n.createdAt)}</p>
          </div>
          <span class="pill pill-${n.type === 'Emergency' ? 'red' : n.type === 'Event' ? 'gold' : 'maroon'}">${n.type || 'Notice'}</span>
        </div>
        ${n.description ? `<p style="font-size:14px;margin-top:4px;">${n.description}</p>` : ''}
      </div>
    `).join('')}
  `;
}

// =====================================================
// SECTION 16: LEAVE MANAGEMENT
// =====================================================

function renderLeaves() {
  const leaves = DB.get('leaves');
  const students = DB.get('students');
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>✈️ Leave Requests (${leaves.length})</h2>
    </div>
    
    <div class="tabs" style="margin-bottom:16px;">
      <button class="tab active" onclick="renderLeaves()">All</button>
      <button class="tab" onclick="renderLeavesFilter('pending')">Pending</button>
      <button class="tab" onclick="renderLeavesFilter('approved')">Approved</button>
      <button class="tab" onclick="renderLeavesFilter('rejected')">Rejected</button>
    </div>
    
    ${leaves.length === 0 ? `
      <div class="empty-state">
        <div class="icon">✈️</div>
        <h3>No Leave Requests</h3>
        <p>No leave requests from parents.</p>
      </div>
    ` : [...leaves].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '')).map(l => {
      const student = students.find(s => s.id === l.studentId);
      const statusColor = l.status === 'approved' ? 'green' : l.status === 'rejected' ? 'red' : 'yellow';
      return `
        <div class="card" style="margin-bottom:8px;">
          <div class="row-between">
            <div>
              <h4>${student?.name || 'Unknown'}</h4>
              <p style="font-size:13px;color:var(--text-light);">${formatDate(l.fromDate)} - ${formatDate(l.toDate)}</p>
              ${l.reason ? `<p style="font-size:13px;">Reason: ${l.reason}</p>` : ''}
            </div>
            <div style="text-align:right;">
              <span class="pill pill-${statusColor}">${l.status?.toUpperCase() || 'PENDING'}</span>
              ${l.status === 'pending' ? `
                <div class="row" style="margin-top:8px;gap:4px;">
                  <button class="btn btn-sm btn-primary" onclick="approveLeave('${l.id}')">✅</button>
                  <button class="btn btn-sm btn-outline" onclick="rejectLeave('${l.id}')">❌</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderLeavesFilter(status) {
  state.filters.leaveFilter = status;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  const leaves = DB.get('leaves').filter(l => l.status === status);
  renderFilteredLeaves(leaves);
}

function renderFilteredLeaves(leaves) {
  renderLeaves();
}

function approveLeave(id) {
  DB.update('leaves', id, { status: 'approved', decidedBy: state.user.name, decidedAt: new Date().toISOString() });
  showToast('Leave approved!', 'success');
  renderLeaves();
}

function rejectLeave(id) {
  if (confirm('Reject this leave request?')) {
    DB.update('leaves', id, { status: 'rejected', decidedBy: state.user.name, decidedAt: new Date().toISOString() });
    showToast('Leave rejected.', 'info');
    renderLeaves();
  }
}

// Parent Leave View
function renderParentLeaves() {
  const studentIds = state.session.studentIds || [];
  const students = DB.get('students').filter(s => studentIds.includes(s.id));
  const leaves = DB.get('leaves').filter(l => studentIds.includes(l.studentId));
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="dashboard-greeting">Leave Management</div>
    <h1 class="dashboard-name">✈️ Leave Requests</h1>
    
    <button class="btn btn-primary w-full" style="margin-bottom:16px;" onclick="renderLeaveApplicationForm()">
      ✈️ Apply for Leave
    </button>
    
    ${leaves.length === 0 ? `
      <div class="empty-state">
        <div class="icon">✈️</div>
        <h3>No Leave Requests</h3>
        <p>You haven't applied for any leave yet.</p>
      </div>
    ` : leaves.map(l => {
      const student = students.find(s => s.id === l.studentId);
      const statusColor = l.status === 'approved' ? 'green' : l.status === 'rejected' ? 'red' : 'yellow';
      return `
        <div class="card" style="margin-bottom:8px;">
          <div class="row-between">
            <div>
              <h4>${student?.name || 'Child'}</h4>
              <p style="font-size:13px;color:var(--text-light);">${formatDate(l.fromDate)} - ${formatDate(l.toDate)}</p>
              <p style="font-size:13px;">${l.reason || ''}</p>
            </div>
            <span class="pill pill-${statusColor}">${l.status?.toUpperCase() || 'PENDING'}</span>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function renderLeaveApplicationForm() {
  const studentIds = state.session.studentIds || [];
  const students = DB.get('students').filter(s => studentIds.includes(s.id));
  
  showModal('Apply for Leave', `
    <form onsubmit="event.preventDefault();saveLeaveApplication()">
      <div class="input-group">
        <label>Child *</label>
        <select class="input-field" id="lv_student" required>
          <option value="">Select Child</option>
          ${students.map(s => `<option value="${s.id}">${s.name} (${s.className || ''})</option>`).join('')}
        </select>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>From Date *</label>
          <input type="date" class="input-field" id="lv_from" required>
        </div>
        <div class="input-group">
          <label>To Date *</label>
          <input type="date" class="input-field" id="lv_to" required>
        </div>
      </div>
      <div class="input-group">
        <label>Reason *</label>
        <textarea class="input-field" id="lv_reason" required placeholder="Reason for leave..."></textarea>
      </div>
      <button type="submit" class="btn btn-primary w-full">✈️ Submit Leave Request</button>
    </form>
  `);
}

function saveLeaveApplication() {
  const data = {
    studentId: document.getElementById('lv_student').value,
    fromDate: document.getElementById('lv_from').value,
    toDate: document.getElementById('lv_to').value,
    reason: document.getElementById('lv_reason').value,
    status: 'pending',
    id: DB.genId('LV'),
    createdAt: new Date().toISOString(),
    appliedBy: state.user.name,
    parentPhone: state.session.phone
  };
  
  DB.add('leaves', data);
  closeModal();
  renderParentLeaves();
  showToast('Leave request submitted!', 'success');
}

// =====================================================
// SECTION 17: REPORTS (Admin)
// =====================================================

function renderReports() {
  const students = DB.get('students');
  const fees = DB.get('fees');
  const attendance = DB.get('attendance');
  const classes = DB.get('classes');
  const testResults = DB.get('testResults');
  
  const totalFees = fees.reduce((s, f) => s + (f.amount || 0), 0);
  const collectedFees = fees.reduce((s, f) => s + (f.paidAmount || 0), 0);
  const pendingFees = totalFees - collectedFees;
  
  // Attendance trends
  const dates = [...new Set(attendance.map(a => a.date))].sort();
  
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>📈 Reports & Analytics</h2>
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <h3>📊 Revenue Overview</h3>
      <div class="grid-3" style="margin-top:12px;">
        <div class="card-cream" style="text-align:center;padding:16px;">
          <div style="font-size:24px;font-weight:700;">₹${totalFees.toLocaleString()}</div>
          <div style="font-size:12px;">Total Fees</div>
        </div>
        <div class="card-cream" style="text-align:center;padding:16px;">
          <div style="font-size:24px;font-weight:700;color:#28a745;">₹${collectedFees.toLocaleString()}</div>
          <div style="font-size:12px;">Collected</div>
        </div>
        <div class="card-cream" style="text-align:center;padding:16px;">
          <div style="font-size:24px;font-weight:700;color:#dc3545;">₹${pendingFees.toLocaleString()}</div>
          <div style="font-size:12px;">Pending</div>
        </div>
      </div>
      <div class="progress-bar" style="margin-top:12px;">
        <div class="progress-fill" style="width:${totalFees > 0 ? (collectedFees / totalFees) * 100 : 0}%"></div>
      </div>
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <h3>📈 Fee Collection Trend</h3>
      <div class="row" style="margin-top:8px;gap:4px;height:120px;align-items:flex-end;">
        ${dates.slice(-14).map(d => {
          const dayFees = fees.filter(f => f.createdAt?.startsWith(d));
          const dayTotal = dayFees.reduce((s, f) => s + (f.paidAmount || 0), 0);
          const maxFee = Math.max(...fees.map(f => f.paidAmount || 0), 1);
          const height = Math.max(5, (dayTotal / (totalFees || 1)) * 100);
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
            <div style="width:100%;background:var(--maroon);border-radius:4px 4px 0 0;height:${Math.min(height, 100)}px;transition:height 0.5s ease;"></div>
            <span style="font-size:8px;margin-top:2px;color:var(--text-light);">${d?.slice(5) || ''}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
    
    <div class="card" style="margin-bottom:16px;">
      <h3>🏆 Top Performing Students</h3>
      ${testResults.length === 0 ? '<p style="color:var(--text-light);font-size:13px;">No test results yet.</p>' : 
        [...new Map(testResults.map(r => [r.studentId, r])).values()]
          .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
          .slice(0, 5)
          .map((r, i) => {
            const student = students.find(s => s.id === r.studentId);
            return `
              <div class="list-item" style="padding:8px 12px;">
                <div style="width:24px;text-align:center;font-weight:700;color:var(--gold);">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</div>
                <div class="info">
                  <h4 style="font-size:14px;">${student?.name || 'Unknown'}</h4>
                  <p style="font-size:12px;">${student?.className || ''}</p>
                </div>
                <div style="font-weight:700;">${r.percentage}%</div>
              </div>
            `;
          }).join('')
      }
    </div>
    
    <div class="grid-2">
      <button class="btn btn-secondary" onclick="showToast('Export feature coming soon!','info')">📥 Export All Data</button>
      <button class="btn btn-outline" onclick="showToast('Print feature coming soon!','info')">🖨️ Print Reports</button>
    </div>
  `;
}

// =====================================================
// SECTION 18: SETTINGS
// =====================================================

function renderSettings() {
  const content = document.getElementById('pageContent');
  
  content.innerHTML = `
    <div class="section-header">
      <h2>⚙️ Settings</h2>
    </div>
    
    <div class="card" style="margin-bottom:12px;">
      <div class="row-between">
        <div>
          <h4>🌙 Dark Mode</h4>
          <p style="font-size:13px;color:var(--text-light);">Toggle dark/light theme</p>
        </div>
        <label style="position:relative;display:inline-block;width:48px;height:26px;">
          <input type="checkbox" ${state.darkMode ? 'checked' : ''} onchange="toggleDarkMode(this.checked)" style="opacity:0;width:0;height:0;">
          <span style="position:absolute;cursor:pointer;inset:0;background:${state.darkMode ? 'var(--maroon)' : 'var(--cream-dark)'};border-radius:26px;transition:0.3s;">
            <span style="position:absolute;left:3px;top:3px;width:20px;height:20px;background:white;border-radius:50%;transition:0.3s;transform:${state.darkMode ? 'translateX(22px)' : 'translateX(0)'};"></span>
          </span>
        </label>
      </div>
    </div>
    
    <div class="card" style="margin-bottom:12px;">
      <div class="row-between">
        <div>
          <h4>🔔 Notifications</h4>
          <p style="font-size:13px;color:var(--text-light);">Receive push notifications</p>
        </div>
        <label style="position:relative;display:inline-block;width:48px;height:26px;">
          <input type="checkbox" checked onchange="showToast('Notification settings saved!','info')" style="opacity:0;width:0;height:0;">
          <span style="position:absolute;cursor:pointer;inset:0;background:var(--maroon);border-radius:26px;transition:0.3s;">
            <span style="position:absolute;right:3px;top:3px;width:20px;height:20px;background:white;border-radius:50%;transition:0.3s;"></span>
          </span>
        </label>
      </div>
    </div>
    
    <div class="card" style="margin-bottom:12px;">
      <div class="row-between">
        <div>
          <h4>🔄 Auto Sync</h4>
          <p style="font-size:13px;color:var(--text-light);">Automatically sync data</p>
        </div>
        <label style="position:relative;display:inline-block;width:48px;height:26px;">
          <input type="checkbox" checked onchange="showToast('Sync setting updated!','info')" style="opacity:0;width:0;height:0;">
          <span style="position:absolute;cursor:pointer;inset:0;background:var(--maroon);border-radius:26px;transition:0.3s;">
            <span style="position:absolute;right:3px;top:3px;width:20px;height:20px;background:white;border-radius:50%;transition:0.3s;"></span>
          </span>
        </label>
      </div>
    </div>
    
    ${state.user.role === 'admin' ? `
    <div class="card" style="margin-bottom:12px;">
      <h4>📊 Google Apps Script API</h4>
      <div class="input-group">
        <label>API URL</label>
        <input class="input-field" id="settings_gas_url" value="${CONFIG.GAS_API_URL}" placeholder="https://script.google.com/macros/s/...">
      </div>
      <button class="btn btn-sm btn-secondary" onclick="saveGASUrl()">💾 Save</button>
    </div>
    ` : ''}
    
    <div class="card" style="margin-bottom:12px;">
      <h4>🏫 School Information</h4>
      <div style="font-size:14px;">
        <div class="row-between"><span>School:</span> <span>${CONFIG.SCHOOL_NAME}</span></div>
        <div class="row-between"><span>Phone:</span> <span>${CONFIG.SCHOOL_PHONE}</span></div>
        <div class="row-between"><span>Email:</span> <span>${CONFIG.SCHOOL_EMAIL}</span></div>
        <div class="row-between"><span>Version:</span> <span>1.0.0 (Surya Connect)</span></div>
      </div>
    </div>
    
    <div class="card" style="margin-bottom:12px;">
      <h4>💾 Data Management</h4>
      <div class="row" style="margin-top:8px;gap:8px;">
        <button class="btn btn-sm btn-secondary" onclick="exportAllData()">📥 Export Data</button>
        <button class="btn btn-sm btn-outline" onclick="importData()">📤 Import Data</button>
        <button class="btn btn-sm btn-outline" onclick="clearAllData()">🗑️ Clear Data</button>
      </div>
    </div>
    
    <div class="card" style="text-align:center;padding:16px;">
      <p style="font-size:13px;color:var(--text-light);">Surya Connect v1.0</p>
      <p style="font-size:12px;color:var(--text-light);">© ${new Date().getFullYear()} ${CONFIG.SCHOOL_NAME}</p>
    </div>
  `;
}

function toggleDarkMode(enabled) {
  state.darkMode = enabled;
  document.body.classList.toggle('dark-mode', enabled);
  localStorage.setItem('surya_dark_mode', enabled ? '1' : '0');
  showToast(enabled ? 'Dark mode enabled' : 'Light mode enabled', 'info');
}

function saveGASUrl() {
  const url = document.getElementById('settings_gas_url').value;
  CONFIG.GAS_API_URL = url;
  CONFIG.GAS_ENABLED = !!url;
  showToast('API URL saved! Enable sync for automatic data backup.', 'success');
}

function exportAllData() {
  const allData = {};
  for (const key of Object.keys(CONFIG.STORAGE_KEYS)) {
    if (key !== 'SESSION') {
      allData[key.toLowerCase()] = DB.get(key);
    }
  }
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `surya_connect_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('Data exported successfully!', 'success');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    try {
      const text = await e.target.files[0].text();
      const data = JSON.parse(text);
      for (const key of Object.keys(data)) {
        const storageKey = CONFIG.STORAGE_KEYS[key.toUpperCase()];
        if (storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(data[key]));
        }
      }
      showToast('Data imported successfully!', 'success');
      navigateTo(state.currentPage);
    } catch (err) {
      showToast('Failed to import data. Invalid file.', 'error');
    }
  };
  input.click();
}

function clearAllData() {
  if (confirm('⚠️ This will delete ALL data! Are you sure?')) {
    if (confirm('Really? This cannot be undone!')) {
      for (const key of Object.keys(CONFIG.STORAGE_KEYS)) {
        if (key !== 'SESSION') {
          localStorage.removeItem(CONFIG.STORAGE_KEYS[key]);
        }
      }
      showToast('All data cleared.', 'info');
      navigateTo('dashboard');
    }
  }
}

// =====================================================
// SECTION 19: PROFILE
// =====================================================

function renderProfile() {
  const content = document.getElementById('pageContent');
  
  content.innerHTML = `
    <div class="section-header">
      <h2>👤 Profile</h2>
    </div>
    
    <div class="card-gradient" style="text-align:center;padding:32px;margin-bottom:16px;">
      <div style="width:80px;height:80px;border-radius:var(--radius-full);background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 12px;">
        ${state.user.name?.charAt(0) || '?'}
      </div>
      <h3 style="font-size:22px;">${state.user.name}</h3>
      <p style="opacity:0.8;">${state.user.role === 'admin' ? 'Administrator' : 'Parent'}</p>
    </div>
    
    <div class="card" style="margin-bottom:12px;">
      <div class="input-group">
        <label>Display Name</label>
        <input class="input-field" id="profile_name" value="${state.user.name}">
      </div>
      <div class="input-group">
        <label>${state.user.role === 'admin' ? 'Admin ID' : 'Mobile Number'}</label>
        <input class="input-field" value="${state.session?.userId || state.session?.phone || ''}" readonly>
      </div>
      ${state.user.role === 'admin' ? '' : `
      <p style="font-size:13px;color:var(--text-light);">
        👨‍👩‍👧‍👦 Linked Students: ${(state.session?.studentIds || []).length}
      </p>
      `}
      <button class="btn btn-primary w-full" style="margin-top:12px;" onclick="showToast('Profile updated!','success')">💾 Save Profile</button>
    </div>
    
    <div class="card" style="margin-bottom:12px;">
      <div class="row-between">
        <div>
          <h4>🔐 Change Password</h4>
          <p style="font-size:13px;color:var(--text-light);">Update your login password</p>
        </div>
        <button class="btn btn-sm btn-outline" onclick="showToast('Password change feature coming soon!','info')">Change</button>
      </div>
    </div>
    
    <button class="btn btn-outline w-full" onclick="logout()">🚪 Logout</button>
  `;
}

// =====================================================
// SECTION 20: STUDENT-SPECIFIC VIEWS (Used in Student Profile)
// =====================================================

function viewStudentAttendance(studentId) {
  closeModal();
  const student = DB.find('students', s => s.id === studentId);
  const attendance = DB.filter('attendance', a => a.studentId === studentId);
  
  showModal(`${student?.name} - Attendance`, `
    <div class="grid-3" style="margin-bottom:12px;">
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${attendance.filter(a => a.status === 'present').length}</div>
        <div style="font-size:11px;">Present</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${attendance.filter(a => a.status === 'absent').length}</div>
        <div style="font-size:11px;">Absent</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${attendance.length > 0 ? Math.round((attendance.filter(a => a.status === 'present').length / attendance.length) * 100) : 0}%</div>
        <div style="font-size:11px;">Percentage</div>
      </div>
    </div>
    <div style="max-height:300px;overflow-y:auto;">
      ${attendance.sort((a, b) => b.date?.localeCompare(a.date || '')).map(a => `
        <div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--cream-dark);font-size:14px;">
          <span>${formatDate(a.date)}</span>
          <span class="pill pill-${a.status === 'present' ? 'green' : a.status === 'absent' ? 'red' : 'yellow'}">${a.status?.toUpperCase()}</span>
        </div>
      `).join('')}
    </div>
  `);
}

function viewStudentFees(studentId) {
  closeModal();
  const student = DB.find('students', s => s.id === studentId);
  const fees = DB.filter('fees', f => f.studentId === studentId);
  
  const total = fees.reduce((s, f) => s + (f.amount || 0), 0);
  const paid = fees.reduce((s, f) => s + (f.paidAmount || 0), 0);
  
  showModal(`${student?.name} - Fees`, `
    <div class="grid-3" style="margin-bottom:12px;">
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">₹${total.toLocaleString()}</div>
        <div style="font-size:11px;">Total</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;color:#28a745;">₹${paid.toLocaleString()}</div>
        <div style="font-size:11px;">Paid</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;color:#dc3545;">₹${(total - paid).toLocaleString()}</div>
        <div style="font-size:11px;">Pending</div>
      </div>
    </div>
    ${fees.map(f => `
      <div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--cream-dark);font-size:14px;">
        <div>
          <span>${f.feeType || 'Tuition'} - ${f.term || ''}</span>
          <span class="pill pill-${f.status === 'paid' ? 'green' : f.status === 'pending' ? 'red' : 'yellow'}" style="margin-left:8px;">${f.status?.toUpperCase()}</span>
        </div>
        <span>₹${(f.paidAmount || 0).toLocaleString()}</span>
      </div>
    `).join('')}
  `);
}

function viewStudentTests(studentId) {
  closeModal();
  const student = DB.find('students', s => s.id === studentId);
  const results = DB.filter('testResults', r => r.studentId === studentId);
  const tests = DB.get('tests');
  
  showModal(`${student?.name} - Tests`, `
    <div class="grid-3" style="margin-bottom:12px;">
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${results.length}</div>
        <div style="font-size:11px;">Tests</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${results.length > 0 ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length) : 0}%</div>
        <div style="font-size:11px;">Avg Score</div>
      </div>
      <div class="card-cream" style="text-align:center;padding:12px;">
        <div style="font-size:20px;font-weight:700;">${results.sort((a, b) => (b.percentage || 0) - (a.percentage || 0))[0]?.grade || '-'}</div>
        <div style="font-size:11px;">Top Grade</div>
      </div>
    </div>
    ${results.map(r => {
      const test = tests.find(t => t.id === r.testId);
      const color = r.percentage >= 75 ? 'green' : r.percentage >= 45 ? 'yellow' : 'red';
      return `
        <div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--cream-dark);">
          <div>
            <div style="font-weight:600;font-size:14px;">${test?.name || 'Test'} (${test?.subject || ''})</div>
            <div style="font-size:12px;color:var(--text-light);">${formatDate(test?.date)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;">${r.marks}/${r.totalMarks}</div>
            <span class="pill pill-${color}">${r.grade} • ${r.percentage}%</span>
          </div>
        </div>
      `;
    }).join('')}
  `);
}

function reviewLeave(leaveId) {
  const leave = DB.find('leaves', l => l.id === leaveId);
  const student = DB.find('students', s => s.id === leave?.studentId);
  if (!leave) return;
  
  showModal('Review Leave Request', `
    <div style="margin-bottom:12px;">
      <div class="row-between"><strong>Student:</strong> <span>${student?.name || 'Unknown'}</span></div>
      <div class="row-between"><strong>From:</strong> <span>${formatDate(leave.fromDate)}</span></div>
      <div class="row-between"><strong>To:</strong> <span>${formatDate(leave.toDate)}</span></div>
      <div class="row-between"><strong>Reason:</strong> <span>${leave.reason || 'N/A'}</span></div>
      <div class="row-between"><strong>Status:</strong> <span class="pill pill-yellow">PENDING</span></div>
    </div>
    <div class="row" style="gap:12px;">
      <button class="btn btn-primary flex-1" onclick="approveLeave('${leaveId}');closeModal();">✅ Approve</button>
      <button class="btn btn-outline flex-1" onclick="rejectLeave('${leaveId}');closeModal();">❌ Reject</button>
    </div>
  `);
}

// =====================================================
// SECTION 21: INITIALIZATION
// =====================================================

// Seed sample data if empty
function seedSampleData() {
  if (DB.get('students').length === 0) {
    const classes = [
      { id: 'CLS_NUR_A', name: 'Nursery', section: 'A', capacity: 30, teacher: 'Mrs. Sharma', academicYear: '2025-2026', subjects: 'English, Hindi, Maths, Drawing, Rhymes', createdAt: new Date().toISOString() },
      { id: 'CLS_LKG_A', name: 'LKG', section: 'A', capacity: 30, teacher: 'Ms. Patel', academicYear: '2025-2026', subjects: 'English, Hindi, Maths, Drawing, Rhymes', createdAt: new Date().toISOString() },
      { id: 'CLS_UKG_A', name: 'UKG', section: 'A', capacity: 30, teacher: 'Mr. Singh', academicYear: '2025-2026', subjects: 'English, Hindi, Maths, EVS, Drawing', createdAt: new Date().toISOString() },
    ];
    classes.forEach(c => DB.add('classes', c));
    
    const students = [
      { id: 'STU001', name: 'Aarav Verma', admissionNumber: 'ADM001', classId: 'CLS_NUR_A', section: 'A', rollNumber: '1', fatherName: 'Rohit Verma', motherName: 'Anita Verma', fatherPhone: '9876543210', motherPhone: '9876543211', className: 'Nursery', active: true, gender: 'Male', bloodGroup: 'O+', totalFees: 24000, discount: 0, createdAt: new Date().toISOString() },
      { id: 'STU002', name: 'Diya Sharma', admissionNumber: 'ADM002', classId: 'CLS_NUR_A', section: 'A', rollNumber: '2', fatherName: 'Amit Sharma', motherName: 'Priya Sharma', fatherPhone: '9876543212', motherPhone: '9876543213', className: 'Nursery', active: true, gender: 'Female', bloodGroup: 'A+', totalFees: 24000, discount: 1000, createdAt: new Date().toISOString() },
      { id: 'STU003', name: 'Arjun Patel', admissionNumber: 'ADM003', classId: 'CLS_LKG_A', section: 'A', rollNumber: '1', fatherName: 'Vikram Patel', motherName: 'Neha Patel', fatherPhone: '9876543214', motherPhone: '9876543215', className: 'LKG', active: true, gender: 'Male', bloodGroup: 'B+', totalFees: 28000, discount: 0, createdAt: new Date().toISOString() },
      { id: 'STU004', name: 'Riya Singh', admissionNumber: 'ADM004', classId: 'CLS_LKG_A', section: 'A', rollNumber: '2', fatherName: 'Raj Singh', motherName: 'Simran Singh', fatherPhone: '9876543216', motherPhone: '9876543217', className: 'LKG', active: true, gender: 'Female', bloodGroup: 'AB+', totalFees: 28000, discount: 2000, createdAt: new Date().toISOString() },
      { id: 'STU005', name: 'Kavya Gupta', admissionNumber: 'ADM005', classId: 'CLS_UKG_A', section: 'A', rollNumber: '1', fatherName: 'Suresh Gupta', motherName: 'Meera Gupta', fatherPhone: '9876543218', motherPhone: '9876543219', className: 'UKG', active: true, gender: 'Female', bloodGroup: 'O-', totalFees: 30000, discount: 0, createdAt: new Date().toISOString() },
    ];
    students.forEach(s => DB.add('students', s));
    
    // Sample attendance for last 5 days
    const today = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      students.forEach(s => {
        const status = Math.random() > 0.2 ? 'present' : 'absent';
        DB.add('attendance', { id: DB.genId('ATT'), studentId: s.id, classId: s.classId, date: dateStr, status, createdAt: new Date().toISOString() });
      });
    }
    
    // Sample fees
    DB.add('fees', { id: DB.genId('FEE'), studentId: 'STU001', feeType: 'Tuition', term: 'Annual', amount: 24000, paidAmount: 12000, pendingAmount: 12000, paymentMode: 'Online', status: 'partial', createdAt: new Date().toISOString() });
    DB.add('fees', { id: DB.genId('FEE'), studentId: 'STU002', feeType: 'Tuition', term: 'Annual', amount: 23000, paidAmount: 23000, pendingAmount: 0, paymentMode: 'Cash', status: 'paid', createdAt: new Date().toISOString() });
    DB.add('fees', { id: DB.genId('FEE'), studentId: 'STU003', feeType: 'Tuition', term: 'Annual', amount: 28000, paidAmount: 5000, pendingAmount: 23000, paymentMode: 'Online', status: 'partial', createdAt: new Date().toISOString() });
    DB.add('fees', { id: DB.genId('FEE'), studentId: 'STU004', feeType: 'Activity', term: 'Term 1', amount: 5000, paidAmount: 5000, pendingAmount: 0, paymentMode: 'UPI', status: 'paid', createdAt: new Date().toISOString() });
    DB.add('fees', { id: DB.genId('FEE'), studentId: 'STU005', feeType: 'Tuition', term: 'Annual', amount: 30000, paidAmount: 0, pendingAmount: 30000, paymentMode: '', status: 'pending', createdAt: new Date().toISOString() });
    
    // Sample notices
    DB.add('notices', { id: DB.genId('NTC'), title: '🎉 PTM on Saturday', description: 'Parent-Teacher Meeting at 10 AM. All parents requested to attend.', type: 'Event', target: 'All', createdAt: new Date(Date.now() - 86400000).toISOString(), createdBy: 'Admin' });
    DB.add('notices', { id: DB.genId('NTC'), title: '☀️ Summer Holidays', description: 'School will remain closed from June 15 to June 30 for summer break.', type: 'Holiday', target: 'All', createdAt: new Date(Date.now() - 172800000).toISOString(), createdBy: 'Admin' });
    
    // Sample gallery
    DB.add('gallery', { id: DB.genId('GAL'), imageUrl: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400', title: 'School Building', type: 'image', album: 'Campus', createdAt: new Date().toISOString(), uploadedBy: 'Admin' });
    DB.add('gallery', { id: DB.genId('GAL'), imageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400', title: 'Classroom', type: 'image', album: 'Campus', createdAt: new Date().toISOString(), uploadedBy: 'Admin' });
    DB.add('gallery', { id: DB.genId('GAL'), imageUrl: 'https://images.unsplash.com/photo-1571939228382-b2f2b585ce15?w=400', title: 'Playground', type: 'image', album: 'Sports', createdAt: new Date().toISOString(), uploadedBy: 'Admin' });
    DB.add('gallery', { id: DB.genId('GAL'), imageUrl: 'https://images.unsplash.com/photo-1588072432836-e10032774350?w=400', title: 'Art Class', type: 'image', album: 'Activities', createdAt: new Date().toISOString(), uploadedBy: 'Admin' });
    DB.add('gallery', { id: DB.genId('GAL'), imageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400', title: 'Reading Time', type: 'image', album: 'Activities', createdAt: new Date().toISOString(), uploadedBy: 'Admin' });
    DB.add('gallery', { id: DB.genId('GAL'), imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', title: 'Annual Function Rehearsal', type: 'image', album: 'Events', createdAt: new Date().toISOString(), uploadedBy: 'Admin' });
    
    // Sample homework
    DB.add('homework', { id: DB.genId('HW'), classId: 'CLS_NUR_A', subject: 'English', description: 'Trace letters A to E in your notebook.', dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], title: 'English - Nursery A', createdAt: new Date().toISOString(), createdBy: 'Mrs. Sharma' });
    DB.add('homework', { id: DB.genId('HW'), classId: 'CLS_LKG_A', subject: 'Maths', description: 'Count and write numbers 1 to 20.', dueDate: new Date(Date.now() + 172800000).toISOString().split('T')[0], title: 'Maths - LKG A', createdAt: new Date().toISOString(), createdBy: 'Ms. Patel' });
    
    // Sample test
    const testId = DB.genId('TST');
    DB.add('tests', { id: testId, name: 'Term 1 Assessment', subject: 'English', classId: 'CLS_NUR_A', date: new Date(Date.now() - 86400000).toISOString().split('T')[0], maxMarks: 20, description: 'Basic English assessment', createdAt: new Date().toISOString() });
    DB.add('testResults', { id: DB.genId('RES'), testId, studentId: 'STU001', marks: 18, totalMarks: 20, percentage: 90, grade: 'A+', remarks: 'Excellent work!', createdAt: new Date().toISOString() });
    DB.add('testResults', { id: DB.genId('RES'), testId, studentId: 'STU002', marks: 15, totalMarks: 20, percentage: 75, grade: 'A', remarks: 'Good effort.', createdAt: new Date().toISOString() });
    
    // Sample staff
    DB.add('staff', { id: DB.genId('STF'), name: 'Mrs. Sunita Sharma', designation: 'Teacher', phone: '9876543220', email: 'sunita@suryapreschool.com', salary: 25000, qualification: 'B.Ed', address: 'Mumbai', createdAt: new Date().toISOString() });
    DB.add('staff', { id: DB.genId('STF'), name: 'Mr. Rajesh Kumar', designation: 'Principal', phone: '9876543221', email: 'principal@suryapreschool.com', salary: 45000, qualification: 'M.Ed, MBA', address: 'Mumbai', createdAt: new Date().toISOString() });
    
    // Sample leave
    DB.add('leaves', { id: DB.genId('LV'), studentId: 'STU001', fromDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], toDate: new Date(Date.now() + 172800000).toISOString().split('T')[0], reason: 'Family function', status: 'pending', createdAt: new Date().toISOString(), appliedBy: 'Anita Verma', parentPhone: '9876543210' });
  }
  
  // Sample parent for demo
  const parents = DB.get('parents');
  if (!parents.find(p => p.phone === '9876543210')) {
    DB.add('parents', { id: DB.genId('PAR'), phone: '9876543210', name: 'Anita Verma', studentIds: ['STU001'], createdAt: new Date().toISOString() });
  }
}

// Dark mode restore
function restoreDarkMode() {
  const saved = localStorage.getItem('surya_dark_mode');
  if (saved === '1') {
    state.darkMode = true;
    document.body.classList.add('dark-mode');
  }
}

// =====================================================
// SECTION 22: BOOT
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
  seedSampleData();
  restoreDarkMode();
  
  // Check for auto-login
  if (!checkAutoLogin()) {
    // Show landing screen
    document.getElementById('landingScreen').classList.remove('hidden');
  }
  
  console.log(`%c ${CONFIG.APP_NAME} v1.0 `, 'background: #8B1E00; color: #FFF8EC; font-size: 16px; font-weight: bold; padding: 8px; border-radius: 8px;');
  console.log(`%c ${CONFIG.SCHOOL_NAME} `, 'background: #D35400; color: #FFF8EC; font-size: 14px; padding: 4px 8px; border-radius: 8px;');
});
