import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGPjWq_2XXJqDte530rOmokpMWhn0BNwI",
  authDomain: "money-ven-ead58.firebaseapp.com",
  projectId: "money-ven-ead58",
  storageBucket: "money-ven-ead58.firebasestorage.app",
  messagingSenderId: "1070846481202",
  appId: "1:1070846481202:web:ec42682ef0881332147d2b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

// State
let transactions = [];
let goals = [];

let bcvRate = parseFloat(localStorage.getItem('bcvRate')) || null;
let binanceRate = parseFloat(localStorage.getItem('binanceRate')) || null;

async function saveToFirebase() {
    if (!currentUser) return;
    try {
        await setDoc(doc(db, "users", currentUser.uid), {
            transactions,
            goals
        });
    } catch(e) {
        console.error("Error saving to Firebase:", e);
    }
}

// DOM Elements
const balVesEl = document.getElementById('balVes');
const balUsdtEl = document.getElementById('balUsdt');
const balUsdEl = document.getElementById('balUsd');
const chartTitleEl = document.getElementById('chartTitle');

const transactionListEl = document.getElementById('transactionList');
const fullTransactionListEl = document.getElementById('fullTransactionList');
const transactionCountEl = document.getElementById('transactionCount');
const goalsListEl = document.getElementById('goalsList');

// Modals
const transactionModal = document.getElementById('transactionModal');
const goalModal = document.getElementById('goalModal');
const addFundModal = document.getElementById('addFundModal');
const goalDetailsModal = document.getElementById('goalDetailsModal');

// Forms
const transactionForm = document.getElementById('transactionForm');
const goalForm = document.getElementById('goalForm');
const addFundForm = document.getElementById('addFundForm');

// Filters
const accountFilter = document.getElementById('accountFilter');
const monthFilter = document.getElementById('monthFilter');

const navItems = document.querySelectorAll('.bottom-nav .nav-item[data-target]');
const viewSections = document.querySelectorAll('.view-section');

let balanceChart, statsChart, categoryChart;

const categoryColors = {
    "Mercado": "#f59e0b",
    "Transporte": "#3b82f6",
    "Servicios": "#8b5cf6",
    "Salud": "#ef4444",
    "Gusticos": "#ec4899",
    "Transferencias": "#10b981",
    "Educación": "#06b6d4",
    "Otros": "#6b7280"
};

// Init
function init() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('loginView').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            // Update Profile UI
            const pName = document.getElementById('profileName');
            const pEmail = document.getElementById('profileEmail');
            const pAvatar = document.getElementById('profileAvatar');
            
            if (pName) pName.innerText = user.displayName || 'Usuario';
            if (pEmail) pEmail.innerText = user.email || 'Usuario Premium';
            if (pAvatar && user.photoURL) {
                pAvatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            }
            
            // Listen to real-time updates from Firestore
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    transactions = data.transactions || [];
                    goals = data.goals || [];
                } else {
                    transactions = [];
                    goals = [];
                }
                updateUI();
                initCharts();
                updateCharts();
                setupNavigation();
            });
            fetchRates();
        } else {
            currentUser = null;
            document.getElementById('loginView').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
        }
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed', err));
    }
    
    // Listeners
    transactionForm.addEventListener('submit', addTransaction);
    goalForm.addEventListener('submit', addGoal);
    addFundForm.addEventListener('submit', addFund);
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            updateUI();
            updateCharts();
        });
    }
    
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch(error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                try {
                    await createUserWithEmailAndPassword(auth, email, pass);
                    showToast('Cuenta creada exitosamente', 'success');
                } catch(err2) {
                    showToast('Error: ' + err2.message, 'error');
                }
            } else {
                showToast('Error al iniciar sesión', 'error');
            }
        }
    });
    
    document.getElementById('typeIncome').addEventListener('change', () => {
        document.getElementById('categoryGroup').style.display = 'none';
    });
    document.getElementById('typeExpense').addEventListener('change', () => {
        document.getElementById('categoryGroup').style.display = 'block';
    });
    
    accountFilter.addEventListener('change', () => { updateUI(); updateCharts(); });
    monthFilter.addEventListener('change', () => { updateUI(); updateCharts(); });

    // Dynamic currency symbol on Transaction form
    document.getElementById('txAccount').addEventListener('change', (e) => {
        const symbol = e.target.value === 'ves' ? 'Bs' : '$';
        document.getElementById('txCurrencySymbol').innerText = symbol;
    });

    if (localStorage.getItem('theme') === 'dark') {
        const tgl = document.getElementById('darkModeToggle');
        if(tgl) tgl.checked = true;
        toggleDarkMode(true);
    }
}

window.logout = function() {
    signOut(auth);
};

window.loginWithGoogle = async function() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        showToast('Sesión iniciada con Google', 'success');
    } catch(error) {
        showToast('Error con Google: ' + error.message, 'error');
    }
};

// Fetch BCV and Binance Rates
async function fetchRates() {
    const bcvLabel = document.getElementById('bcvRateLabel');
    const binanceLabel = document.getElementById('binanceRateLabel');
    
    if (bcvRate) bcvLabel.innerText = `Bs ${bcvRate}`;
    if (binanceRate) binanceLabel.innerText = `Bs ${binanceRate}`;

    try {
        const res = await fetch('https://ve.dolarapi.com/v1/dolares');
        const data = await res.json();
        
        const oficial = data.find(d => d.fuente === 'oficial');
        const paralelo = data.find(d => d.fuente === 'paralelo'); // Represents Binance P2P / Paralelo

        if (oficial && oficial.promedio) {
            bcvRate = oficial.promedio;
            localStorage.setItem('bcvRate', bcvRate);
            bcvLabel.innerText = `Bs ${bcvRate.toFixed(2)}`;
        }
        if (paralelo && paralelo.promedio) {
            binanceRate = paralelo.promedio;
            localStorage.setItem('binanceRate', binanceRate);
            binanceLabel.innerText = `Bs ${binanceRate.toFixed(2)}`;
        }
        
        updateUI();
        updateCharts();
    } catch (e) {
        console.error("Error fetching Rates", e);
        if (!bcvRate) bcvLabel.innerText = `Error`;
        if (!binanceRate) binanceLabel.innerText = `Error`;
        updateUI();
        updateCharts();
    }
}

window.openTransactionModal = () => transactionModal.classList.add('active');
window.openGoalModal = () => goalModal.classList.add('active');
window.openAddFundModal = (goalId) => {
    document.getElementById('fundGoalId').value = goalId;
    addFundModal.classList.add('active');
};
window.closeModals = () => {
    transactionModal.classList.remove('active');
    goalModal.classList.remove('active');
    addFundModal.classList.remove('active');
    goalDetailsModal.classList.remove('active');
};

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'ph-check-circle' : 'ph-warning-circle';
    toast.innerHTML = `<i class="ph-fill ${icon}" style="font-size:1.2rem;"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
};

let confirmActionCallback = null;

window.showConfirm = function(message, onConfirm) {
    document.getElementById('confirmMessage').innerText = message;
    confirmActionCallback = onConfirm;
    document.getElementById('confirmModal').classList.add('active');
};

window.handleConfirmYes = function() {
    if (confirmActionCallback) confirmActionCallback();
    closeConfirmModal();
};

window.closeConfirmModal = function() {
    document.getElementById('confirmModal').classList.remove('active');
    confirmActionCallback = null;
};

function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            viewSections.forEach(view => view.classList.remove('active'));
            item.classList.add('active');
            
            navItems.forEach(nav => {
                const icon = nav.querySelector('i');
                if(icon) {
                    if(nav.classList.contains('active')) {
                        icon.classList.remove('ph'); icon.classList.add('ph-fill');
                    } else {
                        icon.classList.remove('ph-fill'); icon.classList.add('ph');
                    }
                }
            });
            
            document.getElementById(item.getAttribute('data-target')).classList.add('active');
        });
    });
}

function getAccountBalance(acc) {
    const t = transactions.filter(x => x.account === acc);
    const inc = t.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0);
    const exp = t.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
    return inc - exp;
}

function getFilteredTransactions() {
    let filtered = [...transactions];
    const acc = accountFilter.value;
    const mo = monthFilter.value;
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';

    if (acc !== 'all') {
        filtered = filtered.filter(t => t.account === acc);
    }
    
    if (search) {
        filtered = filtered.filter(t => 
            t.description.toLowerCase().includes(search) || 
            (t.category && t.category.toLowerCase().includes(search))
        );
    }

    if (mo === 'current') {
        const now = new Date();
        filtered = filtered.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    } else if (mo === 'last') {
        const now = new Date();
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        filtered = filtered.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === lastMonth && d.getFullYear() === year;
        });
    }
    
    return filtered;
}

function updateUI() {
    const fmt = (amt) => new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits:2}).format(amt);

    const ves = getAccountBalance('ves');
    const usdt = getAccountBalance('usdt');
    const usd = getAccountBalance('usd');

    if(balVesEl) balVesEl.innerText = `Bs ${fmt(ves)}`;
    if(balUsdtEl) balUsdtEl.innerText = `$${fmt(usdt)}`;
    if(balUsdEl) balUsdEl.innerText = `$${fmt(usd)}`;

    // Update Equivalents
    if (bcvRate) {
        document.getElementById('eqVes').innerText = `≈ $${fmt(ves / bcvRate)} (BCV)`;
        document.getElementById('eqUsd').innerText = `≈ Bs ${fmt(usd * bcvRate)} (BCV)`;
    }
    
    if (binanceRate) {
        document.getElementById('eqUsdt').innerText = `≈ Bs ${fmt(usdt * binanceRate)} (Binance)`;
    }

    const filtered = getFilteredTransactions();
    if(transactionCountEl) transactionCountEl.innerText = filtered.length;
    
    let chartTitle = "Flujo de Caja";
    if (accountFilter.value === 'ves') chartTitle = "Flujo Bolívares";
    if (accountFilter.value === 'usdt') chartTitle = "Flujo USDT";
    if (accountFilter.value === 'usd') chartTitle = "Flujo Físico";
    if(chartTitleEl) chartTitleEl.innerText = chartTitle;

    renderTransactions(transactionListEl, filtered.slice(0, 5)); 
    // top expenses handled in updateCharts
    renderGoals();
}

window.deleteTransaction = function(id) {
    showConfirm('¿Eliminar esta transacción de tu registro?', () => {
        transactions = transactions.filter(t => t.id !== id);
        saveToFirebase();
        updateUI();
        updateCharts();
    });
};

function renderTransactions(container, list) {
    if(!container) return;
    container.innerHTML = '';
    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay transacciones.</div>';
        return;
    }

    const fmt = (amt) => new Intl.NumberFormat('en-US', {minimumFractionDigits: 2}).format(amt);
    const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const isInc = t.type === 'income';
        const sym = t.account === 'ves' ? 'Bs' : '$';
        const colorClass = isInc ? 'income' : 'expense';
        const prefix = isInc ? '+' : '-';
        const dateStr = new Date(t.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
        
        let accountName = "Bolívares";
        if(t.account === 'usdt') accountName = "USDT";
        if(t.account === 'usd') accountName = "Físico";

        let catText = t.category && t.type === 'expense' ? t.category : (isInc ? 'Ingreso' : 'Otros');

        const div = document.createElement('div');
        div.classList.add('transaction-item');
        div.innerHTML = `
            <div class="t-info">
                <div class="t-icon ${colorClass}">
                    <i class="ph ${isInc ? 'ph-trend-up' : 'ph-trend-down'}"></i>
                </div>
                <div class="t-details">
                    <h4>${t.description}</h4>
                    <p>${dateStr} • ${accountName} • ${catText}</p>
                </div>
            </div>
            <div class="t-actions">
                <div class="t-amount ${colorClass}">${prefix}${sym}${fmt(t.amount)}</div>
                <button class="delete-btn" onclick="editTransaction(${t.id})" style="color:var(--primary); margin-right:-0.5rem;">
                    <i class="ph-fill ph-pencil-simple"></i>
                </button>
                <button class="delete-btn" onclick="deleteTransaction(${t.id})">
                    <i class="ph-fill ph-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.editTransaction = function(id) {
    const t = transactions.find(x => x.id === id);
    if(!t) return;
    
    document.getElementById('editTransactionId').value = t.id;
    if (t.type === 'income') {
        document.getElementById('typeIncome').checked = true;
        document.getElementById('categoryGroup').style.display = 'none';
    } else {
        document.getElementById('typeExpense').checked = true;
        document.getElementById('categoryGroup').style.display = 'block';
        document.getElementById('txCategory').value = t.category || 'Otros';
    }
    document.getElementById('txAccount').value = t.account;
    document.getElementById('description').value = t.description;
    document.getElementById('amount').value = t.amount;
    
    openTransactionModal();
};

function addTransaction(e) {
    e.preventDefault();
    const type = document.querySelector('input[name="type"]:checked').value;
    const account = document.getElementById('txAccount').value;
    const description = document.getElementById('description').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const editId = document.getElementById('editTransactionId').value;
    
    let category = "Otros";
    if (type === 'expense') {
        category = document.getElementById('txCategory').value;
    } else {
        category = "Ingreso";
    }

    if (!description || isNaN(amount) || amount <= 0) return;

    if (type === 'expense') {
        let currentBalance = getAccountBalance(account);
        if (editId) {
            const oldTx = transactions.find(t => t.id === parseInt(editId));
            if (oldTx && oldTx.account === account && oldTx.type === 'expense') {
                currentBalance += oldTx.amount;
            }
        }
        if (amount > currentBalance) {
            showToast('Fondos insuficientes en esta cuenta', 'error');
            return;
        }
    }

    if (editId) {
        const index = transactions.findIndex(t => t.id === parseInt(editId));
        if (index !== -1) {
            transactions[index] = { ...transactions[index], type, account, description, amount, category };
            showToast('Transacción actualizada');
        }
    } else {
        transactions.push({ id: Date.now(), type, account, description, amount, category, date: new Date().toISOString() });
        showToast('Transacción guardada exitosamente');
    }

    saveToFirebase();
    transactionForm.reset();
    document.getElementById('editTransactionId').value = "";
    document.getElementById('typeIncome').checked = true;
    document.getElementById('categoryGroup').style.display = 'none';
    closeModals();
    updateUI();
    updateCharts();
}

// Goals
function renderGoals() {
    if(!goalsListEl) return;
    goalsListEl.innerHTML = '';
    if(goals.length === 0) {
        goalsListEl.innerHTML = '<div class="empty-state">No tienes metas configuradas.</div>';
        return;
    }

    goals.forEach(g => {
        const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
        const div = document.createElement('div');
        div.classList.add('goal-item');
        div.innerHTML = `
            <div class="goal-header" onclick="openGoalDetails(${g.id})" style="cursor: pointer;">
                <span class="goal-title"><span style="margin-right: 0.5rem; font-size: 1.2rem;">${g.emoji || '🎯'}</span>${g.name}</span>
                <span class="goal-progress-text">$${g.saved} / $${g.target} (${pct}%)</span>
            </div>
            <div class="goal-bar-bg" onclick="openGoalDetails(${g.id})" style="cursor: pointer;">
                <div class="goal-bar-fill" style="width: ${pct}%"></div>
            </div>
            <div class="goal-actions" style="margin-top: 0.75rem;">
                <button class="goal-btn delete" onclick="deleteGoal(${g.id})"><i class="ph-bold ph-trash"></i> Borrar</button>
                <button class="goal-btn" onclick="openAddFundModal(${g.id})"><i class="ph-bold ph-plus"></i> Abonar</button>
            </div>
        `;
        goalsListEl.appendChild(div);
    });
}

window.deleteGoal = function(id) {
    showConfirm('¿Estás seguro de que deseas eliminar este objetivo?', () => {
        goals = goals.filter(g => g.id !== id);
        saveToFirebase();
        updateUI();
    });
};

window.openGoalDetails = function(id) {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;

    const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
    const remaining = goal.target - goal.saved;
    
    let suggestedText = "Meta completada 🎉";
    let nextPaymentHtml = "";

    if (remaining > 0 && goal.startDate && goal.endDate) {
        const start = new Date(); // From today
        const end = new Date(goal.endDate);
        let days = (end - start) / (1000 * 60 * 60 * 24);
        if (days < 1) days = 1; // Prevent infinity if it's due today
        
        let periods = 1;
        let label = "";

        if (goal.frequency === 'semanal') {
            periods = days / 7;
            label = "semanales";
        } else if (goal.frequency === 'quincenal') {
            periods = days / 15;
            label = "quincenales";
        } else if (goal.frequency === 'mensual') {
            periods = days / 30.44;
            label = "mensuales";
        }

        if (periods < 1) periods = 1;
        const payment = remaining / periods;
        suggestedText = `$${payment.toFixed(2)} ${label}`;

        // Calculate next payment date
        let nextDate = new Date(goal.startDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        
        if (nextDate < today) {
            while (nextDate < today) {
                if (goal.frequency === 'semanal') {
                    nextDate.setDate(nextDate.getDate() + 7);
                } else if (goal.frequency === 'quincenal') {
                    nextDate.setDate(nextDate.getDate() + 15);
                } else if (goal.frequency === 'mensual') {
                    nextDate.setMonth(nextDate.getMonth() + 1);
                } else {
                    break;
                }
            }
        }
        
        const nextStr = nextDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        nextPaymentHtml = `
            <div style="background: rgba(255,255,255,0.2); border-radius: 8px; padding: 0.4rem 0.8rem; display: inline-block; font-size: 0.85rem; margin-top: 0.5rem;">
                <i class="ph ph-clock"></i> Próxima cuota: <strong>${nextStr}</strong>
            </div>
        `;
    } else if (remaining > 0) {
        suggestedText = "Sin fecha límite configurada";
    }

    const startStr = goal.startDate ? new Date(goal.startDate).toLocaleDateString('es-ES') : '--';
    const endStr = goal.endDate ? new Date(goal.endDate).toLocaleDateString('es-ES') : '--';

    let historyHtml = '';
    if (goal.history && goal.history.length > 0) {
        historyHtml = '<div style="margin-bottom: 1.5rem;"><h4 style="font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-dark);">Historial de Abonos</h4>';
        const sortedHistory = [...goal.history].sort((a,b) => new Date(b.date) - new Date(a.date));
        sortedHistory.forEach(h => {
            const d = new Date(h.date).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
            const accName = h.account === 'ves' ? 'Bs' : (h.account === 'usdt' ? 'USDT' : '$');
            historyHtml += `
                <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
                    <span style="color: var(--text-muted); font-size: 0.85rem;">${d} • ${accName}</span>
                    <strong style="color: var(--success); font-size: 0.9rem;">+$${h.amount.toFixed(2)}</strong>
                </div>`;
        });
        historyHtml += '</div>';
    }

    document.getElementById('goalDetailsContent').innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <div class="logo-icon" style="width: 64px; height: 64px; margin: 0 auto 1rem auto; background: var(--bg-main); font-size: 2.5rem; border-radius: 50%; transform: none; display: flex; align-items: center; justify-content: center; box-shadow: 0 5px 15px rgba(0,0,0,0.05);">
                ${goal.emoji || '🎯'}
            </div>
            <h2 style="font-size: 1.5rem; margin-bottom: 0.25rem;">${goal.name}</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem;">${pct}% Completado</p>
        </div>

        <div style="background: var(--bg-main); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="color: var(--text-muted); font-size: 0.9rem;">Acumulado</span>
                <strong style="color: var(--success);">$${goal.saved.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="color: var(--text-muted); font-size: 0.9rem;">Faltante</span>
                <strong style="color: var(--danger);">$${remaining > 0 ? remaining.toFixed(2) : '0.00'}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <span style="color: var(--text-muted); font-size: 0.9rem;">Meta Total</span>
                <strong style="color: var(--text-dark);">$${goal.target.toFixed(2)}</strong>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
            <div style="background: var(--bg-main); padding: 1rem; border-radius: 12px; text-align: center;">
                <i class="ph ph-calendar-blank" style="color: var(--text-muted); font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
                <p style="color: var(--text-muted); font-size: 0.8rem;">Inicio</p>
                <strong style="font-size: 0.9rem;">${startStr}</strong>
            </div>
            <div style="background: var(--bg-main); padding: 1rem; border-radius: 12px; text-align: center;">
                <i class="ph ph-calendar-check" style="color: var(--text-muted); font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
                <p style="color: var(--text-muted); font-size: 0.8rem;">Límite</p>
                <strong style="font-size: 0.9rem;">${endStr}</strong>
            </div>
        </div>

        <div style="background: var(--primary); color: #fff; padding: 1rem; border-radius: 12px; text-align: center; margin-bottom: 1.5rem;">
            <p style="font-size: 0.85rem; margin-bottom: 0.25rem; opacity: 0.9;">Sugerencia actual para cumplir a tiempo:</p>
            <h3 style="font-size: 1.2rem; margin:0;">${suggestedText}</h3>
            ${nextPaymentHtml}
        </div>
        
        ${historyHtml}

        <div style="display: flex; gap: 1rem;">
            <button class="btn-primary" style="flex: 1; justify-content: center; background: var(--bg-main); color: var(--text-dark); border: 1px solid var(--border-color); box-shadow: none;" onclick="closeModals()">Cerrar</button>
            <button class="btn-primary" style="flex: 1; justify-content: center;" onclick="closeModals(); openAddFundModal(${goal.id})">Abonar</button>
        </div>
    `;

    goalDetailsModal.classList.add('active');
};

function addGoal(e) {
    e.preventDefault();
    const name = document.getElementById('goalName').value;
    const emoji = document.getElementById('goalEmoji').value || '🎯';
    const amount = parseFloat(document.getElementById('goalAmount').value);
    const startDate = document.getElementById('goalStartDate').value;
    const endDate = document.getElementById('goalEndDate').value;
    const frequency = document.getElementById('goalFrequency').value;
    
    if (!name || isNaN(amount) || !startDate || !endDate) return;
    goals.push({ id: Date.now(), name, emoji, target: amount, saved: 0, startDate, endDate, frequency, history: [] });
    
    saveToFirebase();
    goalForm.reset();
    document.getElementById('goalCalculation').style.display = 'none';
    closeModals();
    updateUI();
    showToast('Meta creada con éxito', 'success');
}

function calculateSuggestedAmount() {
    const amount = parseFloat(document.getElementById('goalAmount').value);
    const startDate = document.getElementById('goalStartDate').value;
    const endDate = document.getElementById('goalEndDate').value;
    const frequency = document.getElementById('goalFrequency').value;
    const calcBox = document.getElementById('goalCalculation');
    const suggestText = document.getElementById('goalSuggestedAmount');

    if (!amount || !startDate || !endDate) {
        calcBox.style.display = 'none';
        return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = (end - start) / (1000 * 60 * 60 * 24);

    if (days <= 0) {
        calcBox.style.display = 'block';
        suggestText.innerText = "La fecha límite debe ser mayor al inicio";
        suggestText.style.color = "var(--danger)";
        return;
    }

    suggestText.style.color = "var(--primary)";
    let periods = 1;
    let label = "";

    if (frequency === 'semanal') {
        periods = days / 7;
        label = "semanales";
    } else if (frequency === 'quincenal') {
        periods = days / 15;
        label = "quincenales";
    } else if (frequency === 'mensual') {
        periods = days / 30.44;
        label = "mensuales";
    }

    if (periods < 1) periods = 1;

    const payment = amount / periods;
    calcBox.style.display = 'block';
    suggestText.innerText = `$${payment.toFixed(2)} ${label}`;
}

// Add event listeners for the calculator
document.getElementById('goalAmount').addEventListener('input', calculateSuggestedAmount);
document.getElementById('goalStartDate').addEventListener('change', calculateSuggestedAmount);
document.getElementById('goalEndDate').addEventListener('change', calculateSuggestedAmount);
document.getElementById('goalFrequency').addEventListener('change', calculateSuggestedAmount);

// Set default dates when opening the modal
const originalOpenGoalModal = window.openGoalModal;
window.openGoalModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    document.getElementById('goalStartDate').value = today;
    document.getElementById('goalEndDate').value = nextMonth.toISOString().split('T')[0];
    
    originalOpenGoalModal();
};

function addFund(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('fundGoalId').value);
    const amount = parseFloat(document.getElementById('fundAmount').value);
    const account = document.getElementById('fundAccount').value;
    const goal = goals.find(g => g.id === id);
    if (goal && !isNaN(amount) && amount > 0) {
        const balance = getAccountBalance(account);
        if (amount > balance) {
            showToast('Fondos insuficientes en esta cuenta', 'error');
            return;
        }

        goal.saved += amount;
        if(!goal.history) goal.history = [];
        goal.history.push({ date: new Date().toISOString(), amount, account });
        
        // Deduct from global balance!
        transactions.push({ id: Date.now(), type: 'expense', account: account, description: 'Abono a ' + goal.name, amount: amount, category: 'Ahorro Meta', date: new Date().toISOString() });
        
        saveToFirebase();
        addFundForm.reset();
        closeModals();
        updateUI();
        updateCharts();
        
        if (goal.saved >= goal.target) {
            if (typeof confetti !== 'undefined') {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 3000 });
            }
            showToast('¡Meta completada! Felicidades 🎉', 'success');
        } else {
            showToast('Abono registrado con éxito', 'success');
        }
    }
}

// Charts Configuration
function convertToUSD(amount, currency) {
    if (currency === 'ves') {
        const rate = bcvRate || 36.5;
        return amount / rate;
    }
    if (currency === 'usdt') {
        return amount; // Assuming 1:1
    }
    return amount; // usd
}

function initCharts() {
    Chart.defaults.font.family = "'Inter', sans-serif";
    const ctxB = document.getElementById('balanceChart');
    if(ctxB) {
        balanceChart = new Chart(ctxB.getContext('2d'), {
            type: 'doughnut', data: getChartData(),
            options: {
                responsive: true, maintainAspectRatio: false,
                rotation: -90, circumference: 180, cutout: '80%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });
    }

    const ctxS = document.getElementById('statsChart');
    if(ctxS) {
        statsChart = new Chart(ctxS.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Ingresos', 'Gastos'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderRadius: 12,
                    borderSkipped: false,
                    barThickness: 45
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => '$' + ctx.raw.toFixed(2) } } },
                scales: { 
                    x: { grid: { display: false, drawBorder: false }, ticks: { font: { weight: '600' } } }, 
                    y: { display: false, grid: { display: false } } 
                }
            }
        });
    }

    const ctxC = document.getElementById('categoryChart');
    if(ctxC) {
        categoryChart = new Chart(ctxC.getContext('2d'), {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '75%',
                plugins: { 
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ' $' + ctx.raw.toFixed(2) } }
                }
            }
        });
    }
}

function getChartData() {
    const list = getFilteredTransactions();
    const isAll = accountFilter.value === 'all';
    
    let inc = 0, exp = 0;
    list.forEach(t => {
        let val = isAll ? convertToUSD(t.amount, t.account) : t.amount;
        if (t.type === 'income') inc += val;
        else exp += val;
    });

    if(inc === 0 && exp === 0) return { labels: ['Vacio'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }] };
    return {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{ data: [inc, exp], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0, borderRadius: 10 }]
    };
}

function updateCharts() {
    if (balanceChart) {
        balanceChart.data = getChartData();
        balanceChart.update();
    }
    
    const list = getFilteredTransactions();
    let incUSD = 0, expUSD = 0;
    list.forEach(t => {
        let valUSD = convertToUSD(t.amount, t.account);
        if (t.type === 'income') incUSD += valUSD;
        else expUSD += valUSD;
    });

    if (statsChart) {
        statsChart.data.datasets[0].data = [incUSD, expUSD];
        statsChart.update();
    }

    if (categoryChart) {
        const expenses = list.filter(t => t.type === 'expense');
        const catTotals = {};
        expenses.forEach(t => {
            const cat = t.category || "Otros";
            const val = convertToUSD(t.amount, t.account);
            if (!catTotals[cat]) catTotals[cat] = 0;
            catTotals[cat] += val;
        });

        const labels = Object.keys(catTotals);
        const data = Object.values(catTotals);
        const bgColors = labels.map(l => categoryColors[l] || "#6b7280");

        if (data.length === 0) {
            categoryChart.data = { labels: ['Vacio'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth:0 }] };
            document.getElementById('categoryLegend').innerHTML = '<div style="text-align:center; color:var(--text-muted);">No hay gastos registrados</div>';
        } else {
            categoryChart.data = {
                labels: labels,
                datasets: [{ data: data, backgroundColor: bgColors, borderWidth: 0, borderRadius: 4 }]
            };
            
            // Build custom legend
            let legendHtml = '';
            labels.forEach((lbl, i) => {
                const pct = expUSD > 0 ? ((data[i] / expUSD) * 100).toFixed(1) : 0;
                legendHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${bgColors[i]}"></span>
                            <span style="color: var(--text-dark);">${lbl}</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-weight: 600;">$${data[i].toFixed(2)}</span>
                            <span style="color: var(--text-muted); font-size:0.75rem; margin-left:0.5rem;">${pct}%</span>
                        </div>
                    </div>
                `;
            });
            document.getElementById('categoryLegend').innerHTML = legendHtml;
        }
        categoryChart.update();
    }
    
    const incEl = document.getElementById('statTotalIncome');
    const expEl = document.getElementById('statTotalExpense');
    const netEl = document.getElementById('statNetBalance');
    if (incEl) incEl.innerText = `$${incUSD.toFixed(2)}`;
    if (expEl) expEl.innerText = `$${expUSD.toFixed(2)}`;
    if (netEl) {
        const net = incUSD - expUSD;
        netEl.innerText = `$${net.toFixed(2)}`;
    }

    // Update Top Expenses
    const topExpList = document.getElementById('fullTransactionList');
    if (topExpList) {
        const expenses = list.filter(t => t.type === 'expense').sort((a,b) => {
            return convertToUSD(b.amount, b.account) - convertToUSD(a.amount, a.account);
        }).slice(0, 5);
        renderTransactions(topExpList, expenses);
    }
}

document.addEventListener('DOMContentLoaded', init);

// Settings & Profile Functions
window.toggleDarkMode = function(isDark) {
    if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }
    Chart.defaults.color = isDark ? '#94a3b8' : '#64748b';
    if(statsChart) statsChart.update();
    if(categoryChart) categoryChart.update();
};

window.exportCSV = function() {
    let csv = 'Fecha,Tipo,Cuenta,Categoria,Descripcion,Monto\n';
    transactions.forEach(t => {
        csv += `${new Date(t.date).toLocaleDateString()},${t.type},${t.account},${t.category || ''},"${t.description}",${t.amount}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneyven_reporte_${new Date().getTime()}.csv`;
    a.click();
    showToast('Reporte exportado', 'success');
};

window.exportBackup = function() {
    const data = { transactions, goals, bcvRate, binanceRate };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneyven_backup_${new Date().getTime()}.json`;
    a.click();
    showToast('Copia de seguridad descargada', 'success');
};

window.importBackup = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.transactions) transactions = data.transactions;
            if (data.goals) goals = data.goals;
            
            saveToFirebase();
            updateUI();
            updateCharts();
            showToast('Respaldo restaurado con éxito', 'success');
        } catch(err) {
            showToast('Archivo inválido', 'error');
        }
    };
    reader.readAsText(file);
};

window.wipeData = function() {
    showConfirm('¿Estás SEGURO de querer borrar todos tus datos? Esta acción no se puede deshacer.', () => {
        transactions = [];
        goals = [];
        
        saveToFirebase();
        updateUI();
        updateCharts();
        showToast('Todos los datos han sido borrados', 'success');
    });
};
