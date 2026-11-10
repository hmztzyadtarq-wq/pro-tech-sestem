// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-analytics.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDLD-Y6d7LcyqB0rf3YYbJLTFHDXUsWQNM",
    authDomain: "protech-system.firebaseapp.com",
    projectId: "protech-system",
    storageBucket: "protech-system.firebasestorage.app",
    messagingSenderId: "184422532312",
    appId: "1:184422532312:web:76df7769c281c66fca43ad",
    measurementId: "G-1RRP97BPJC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

const LOW_STOCK_THRESHOLD = 20;

// حالة نموذج الفاتورة: هل المستخدم عدّل "المبلغ المدفوع" يدوياً؟ (لو لأ، بنفترض سداد كامل تلقائياً ونتابع الإجمالي)
let invoicePaidManuallyEdited = false;

// حساب عدد الأيام بين تاريخين (ISO) بدقة - يُستخدم في حساب أيام التأخير بكشف حساب العميل
function daysBetweenISO(startISO, endISO) {
    if(!startISO || !endISO) return null;
    let start = new Date(startISO);
    let end = new Date(endISO);
    if(isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    let diffMs = end.setHours(0,0,0,0) - start.setHours(0,0,0,0);
    return Math.max(0, Math.round(diffMs / 86400000));
}

// إجمالي صافي مديونية عميل واحد (موجب = عليه / سالب = له رصيد) - نفس المعادلة تماماً
// تُستخدم في دليل العملاء، كشف الحساب، ولوحة المؤشرات؛ عشان الأرقام تتطابق 100% في كل الصفحات
function getCustomerNetDebt(customerName) {
    let cust = customers.find(c => c.name === customerName);
    let custInvoices = invoices.filter(i => i.customerName === customerName);
    let totalRemainingFromInvoices = custInvoices.reduce((sum, i) => sum + Number(i.remaining || 0), 0);
    let signedOldBalance = 0;
    if(cust && cust.oldBalance && cust.balanceType === 'on_him') signedOldBalance = Number(cust.oldBalance);
    else if(cust && cust.oldBalance && cust.balanceType === 'for_him') signedOldBalance = -Number(cust.oldBalance);
    return totalRemainingFromInvoices + signedOldBalance;
}

// Data State (Initial Defaults)
let inventory = [
    { code: 'PR-001', name: 'حبر طابعة ياباني أسود ليزر', qty: 45, unit: 'لتر', price: 1200 },
    { code: 'PR-002', name: 'ماكينة طباعة رقمية موديل X', qty: 5, unit: 'قطعة', price: 25000 },
    { code: 'PR-003', name: 'رول استيكر حراري عالي الجودة', qty: 120, unit: 'لفة', price: 150 },
    { code: 'PR-ECO-IN', name: 'ايكو سولفينت إن دور', qty: 50, unit: 'لتر', price: 450 },
    { code: 'PR-OUT', name: 'أوت دور', qty: 50, unit: 'لتر', price: 500 }
];

let customers = [
    { name: 'شركة النور للاستيراد', phone: '01012345678', address: 'القاهرة', oldBalance: 0, oldBalanceDate: '', balanceType: 'none' },
    { name: 'مؤسسة الهلال التجارية', phone: '01098765432', address: 'الجيزة', oldBalance: 0, oldBalanceDate: '', balanceType: 'none' }
];

let invoices = [];

// كشف قراءة فقط لقائمة الفواتير (بدون أي صلاحية تعديل أو حذف)
// يُستخدم في صفحة الموظف المخصصة لإصدار الفواتير فقط (employee-invoice.html)
window.getAllInvoices = function() {
    return invoices.slice();
};
let purchases = [];

// حساب المكن (يدوي ومنفصل عن الفواتير والمخزون)
let machineEntries = [];
let machinePayments = [];

// كشف المصروفات: سجل واحد لكل حركة، إما مصروف عام للشركة (employeeId=null) أو خاص بموظف معين
let companyExpenses = [];

let settings = {
    companyName: 'Bro Tech',
    owner: 'وائل غنيم',
    whatsapp: '01020008299',
    whatsappNabawy: '01092201111',
    address: '195 شارع جسر السويس',
    password: 'protech2026'
};

let currentInvoiceData = null;
let currentInvoiceIndex = null;
let mainChartInstance = null;

// Load data from Firebase on startup
window.onload = async function() {
    await loadDataFromFirebase();
    refreshAllData();
    initChart();
};

async function loadDataFromFirebase() {
    try {
        const docRef = doc(db, "protech_data", "main_store");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if(data.inventory && data.inventory.length > 0) inventory = data.inventory;
            if(data.customers && data.customers.length > 0) customers = data.customers;
            if(data.invoices) invoices = data.invoices;
            if(data.purchases) purchases = data.purchases;
            if(data.companyExpenses) companyExpenses = data.companyExpenses;
            if(data.machineEntries) machineEntries = data.machineEntries;
            if(data.machinePayments) machinePayments = data.machinePayments;
            if(data.settings) settings = { ...settings, ...data.settings };
        } else {
            await saveDataToFirebase();
        }
    } catch (error) {
        console.error("Error loading from Firebase, falling back to localStorage:", error);
        inventory = JSON.parse(localStorage.getItem('protech_inventory')) || inventory;
        customers = JSON.parse(localStorage.getItem('protech_customers')) || customers;
        invoices = JSON.parse(localStorage.getItem('protech_invoices')) || invoices;
        purchases = JSON.parse(localStorage.getItem('protech_purchases')) || purchases;
        companyExpenses = JSON.parse(localStorage.getItem('protech_expenses')) || companyExpenses;
        machineEntries = JSON.parse(localStorage.getItem('protech_machine_entries')) || machineEntries;
        machinePayments = JSON.parse(localStorage.getItem('protech_machine_payments')) || machinePayments;
        settings = { ...settings, ...(JSON.parse(localStorage.getItem('protech_settings')) || {}) };
    }
}

async function saveDataToFirebase() {
    try {
        await setDoc(doc(db, "protech_data", "main_store"), {
            inventory,
            customers,
            invoices,
            purchases,
            companyExpenses,
            machineEntries,
            machinePayments,
            settings,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error saving to Firebase:", error);
    }
}

function saveData() {
    localStorage.setItem('protech_inventory', JSON.stringify(inventory));
    localStorage.setItem('protech_customers', JSON.stringify(customers));
    localStorage.setItem('protech_invoices', JSON.stringify(invoices));
    localStorage.setItem('protech_purchases', JSON.stringify(purchases));
    localStorage.setItem('protech_expenses', JSON.stringify(companyExpenses));
    localStorage.setItem('protech_machine_entries', JSON.stringify(machineEntries));
    localStorage.setItem('protech_machine_payments', JSON.stringify(machinePayments));
    localStorage.setItem('protech_settings', JSON.stringify(settings));
    saveDataToFirebase();
}

function refreshAllData() {
    renderDashboard();
    renderInventory();
    renderInvoices();
    renderPurchases();
    renderCustomers();
    populateSelects();
    renderSettingsForm();
    renderExpensesTab();
    renderMachinesTab();
    renderOverdueAlert();
}
window.refreshAllData = refreshAllData;

// تعبئة فورم الإعدادات بالقيم المحفوظة فعلياً (بدل ما تفضل القيم الافتراضية ثابتة في الصفحة)
function renderSettingsForm() {
    let nameEl = document.getElementById('companyNameInput');
    let ownerEl = document.getElementById('companyOwnerInput');
    let whatsappEl = document.getElementById('whatsappNumberInput');
    let addressEl = document.getElementById('companyAddressInput');
    if(nameEl) nameEl.value = settings.companyName || '';
    if(ownerEl) ownerEl.value = settings.owner || '';
    if(whatsappEl) whatsappEl.value = settings.whatsapp || '';
    if(addressEl) addressEl.value = settings.address || '';
}

// ===================== التنقل بين التابات =====================
window.switchTab = function(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(elx => elx.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-links li').forEach(elx => elx.classList.remove('active'));

    let targetTab = document.getElementById('tab-' + tabId);
    if(targetTab) targetTab.classList.add('active');

    // تحديد العنصر النشط في القائمة الجانبية بدون الاعتماد على window.event (غير موثوق دائماً)
    if (el && el.classList) {
        el.classList.add('active');
    } else if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }

    // إغلاق قائمة الموبايل تلقائياً بعد اختيار صفحة
    const sidebar = document.getElementById('mainSidebar');
    if (sidebar && sidebar.classList.contains('mobile-open') && typeof window.toggleMobileMenu === 'function') {
        window.toggleMobileMenu();
    }
};

// ===================== لوحة المؤشرات =====================
function renderDashboard() {
    let totalStock = inventory.reduce((sum, item) => sum + Number(item.qty), 0);
    let totalSales = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    let totalPurchases = purchases.reduce((sum, p) => sum + Number(p.cost), 0);
    let totalProfit = totalSales - totalPurchases;

    let elStock = document.getElementById('statTotalStock');
    let elSales = document.getElementById('statTotalSales');
    let elPurchases = document.getElementById('statTotalPurchases');
    let elCust = document.getElementById('statTotalCustomers');

    if(elStock) elStock.innerText = totalStock;
    if(elSales) elSales.innerText = totalSales.toLocaleString();
    if(elPurchases) elPurchases.innerText = totalPurchases.toLocaleString();
    if(elCust) elCust.innerText = customers.length;

    let statsGrid = document.querySelector('.stats-grid');
    if(statsGrid && !document.getElementById('statTotalProfit')) {
        let profitCard = document.createElement('div');
        profitCard.className = 'stat-card';
        profitCard.innerHTML = `
            <div class="stat-icon" style="background: #10b981; color: #fff;"><i class="fas fa-chart-line"></i></div>
            <div class="stat-info">
                <h3>إجمالي الربح</h3>
                <span id="statTotalProfit">0 ج.م</span>
            </div>
        `;
        statsGrid.appendChild(profitCard);
    }
    let profitElem = document.getElementById('statTotalProfit');
    if(profitElem) profitElem.innerText = totalProfit.toLocaleString() + ' ج.م';

    // كارت إجمالي مديونيات العملاء - بنفس المعادلة المستخدمة في دليل العملاء وكشف الحساب تماماً
    // عشان الرقم يبقى متطابق 100% في كل صفحات الموقع
    if(statsGrid && !document.getElementById('statTotalDebts')) {
        let debtCard = document.createElement('div');
        debtCard.className = 'stat-card';
        debtCard.onclick = function() { window.switchTab('customers'); };
        debtCard.innerHTML = `
            <div class="stat-icon" style="background: #ef4444; color: #fff;"><i class="fas fa-hand-holding-dollar"></i></div>
            <div class="stat-info">
                <h3>إجمالي مديونيات العملاء</h3>
                <span id="statTotalDebts">0 ج.م</span>
            </div>
        `;
        statsGrid.appendChild(debtCard);
    }
    let debtsElem = document.getElementById('statTotalDebts');
    if(debtsElem) {
        let totalDebts = customers.reduce((sum, c) => {
            let net = getCustomerNetDebt(c.name);
            return sum + (net > 0 ? net : 0);
        }, 0);
        debtsElem.innerText = totalDebts.toLocaleString() + ' ج.م';
    }

    // ===== المؤشر الدائري: نسبة تحصيل المبيعات (كام اتحصل فعلياً من إجمالي المبيعات) =====
    let gaugeCircle = document.getElementById('gaugeProgressCircle');
    if(gaugeCircle) {
        let totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
        let totalCollected = invoices.reduce((sum, inv) => {
            let paidClamped = Math.min(Number(inv.paid || 0), Number(inv.total || 0));
            return sum + Math.max(0, paidClamped);
        }, 0);
        let totalOutstanding = Math.max(0, totalInvoiced - totalCollected);
        let percent = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 100;
        percent = Math.max(0, Math.min(100, percent));

        const CIRCUMFERENCE = 2 * Math.PI * 52; // نفس نصف قطر الدائرة في الـ SVG (r=52)
        let offset = CIRCUMFERENCE * (1 - percent / 100);
        gaugeCircle.style.strokeDasharray = CIRCUMFERENCE.toFixed(1);
        gaugeCircle.style.strokeDashoffset = offset.toFixed(1);
        gaugeCircle.style.stroke = percent >= 70 ? '#10b981' : (percent >= 40 ? '#f59e0b' : '#ef4444');

        let percentText = document.getElementById('gaugePercentText');
        if(percentText) percentText.innerText = percent + '%';
        let paidAmountEl = document.getElementById('gaugePaidAmount');
        if(paidAmountEl) paidAmountEl.innerText = totalCollected.toLocaleString() + ' ج.م';
        let remainingAmountEl = document.getElementById('gaugeRemainingAmount');
        if(remainingAmountEl) remainingAmountEl.innerText = totalOutstanding.toLocaleString() + ' ج.م';
    }

    let recentTbody = document.querySelector('#recentInvoicesTable tbody');
    if(recentTbody) {
        recentTbody.innerHTML = '';
        if(invoices.length === 0) {
            recentTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">لا توجد فواتير بعد</td></tr>`;
        }
        invoices.slice(-5).reverse().forEach(inv => {
            recentTbody.innerHTML += `
                <tr>
                    <td>${inv.id}</td>
                    <td>${inv.customerName}</td>
                    <td>${inv.total.toLocaleString()} ج.م</td>
                    <td>${inv.date}</td>
                </tr>
            `;
        });
    }

    let alertsList = document.getElementById('lowStockAlertsList');
    if(alertsList) {
        alertsList.innerHTML = '';
        let lowItems = inventory.filter(i => Number(i.qty) < LOW_STOCK_THRESHOLD);
        if(lowItems.length === 0) {
            alertsList.innerHTML = '<p style="color:#10b981; font-size:14px;"><i class="fas fa-check-circle"></i> جميع الأصناف في المخزون متوفرة.</p>';
        } else {
            lowItems.forEach(i => {
                alertsList.innerHTML += `<div class="alert-item"><span><bdi style="unicode-bidi: isolate; direction: auto;">${i.name}</bdi></span> <span class="badge-danger">متبقي: ${i.qty} ${i.unit}</span></div>`;
            });
        }
    }
}

// طباعة قائمة المنتجات الناقصة (بجانب لوحة تنبيهات نقص المخزون)
window.printLowStockReport = function() {
    let lowItems = inventory.filter(i => Number(i.qty) < LOW_STOCK_THRESHOLD);
    let todayStr = new Date().toLocaleDateString('ar-EG');

    let rowsHtml = '';
    if(lowItems.length === 0) {
        rowsHtml = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#666;">لا توجد أصناف ناقصة حالياً - المخزون بحالة جيدة</td></tr>`;
    } else {
        lowItems.forEach(i => {
            rowsHtml += `
                <tr>
                    <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">${i.code}</td>
                    <td style="padding:8px; border:1px solid #cbd5e1;">${i.name}</td>
                    <td style="padding:8px; border:1px solid #cbd5e1; text-align:center; color:#e11d48; font-weight:bold;">${i.qty} ${i.unit}</td>
                    <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">${i.price.toLocaleString()} ج.م</td>
                </tr>
            `;
        });
    }

    let printWin = window.open('', '_blank', 'height=700,width=900');
    printWin.document.write(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>قائمة المنتجات الناقصة - Bro Tech</title>
            <style>
                body { font-family: Tahoma, sans-serif; padding: 25px; background:#fff; color:#000; direction: rtl; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; }
                th { background: #f1f5f9; }
                @media print { .no-print { display:none; } }
            </style>
        </head>
        <body>
            <div style="text-align:center; margin-bottom:20px;">
                <h2 style="color:#0284c7; margin:0;">Bro Tech - قائمة المنتجات التي قربت تخلص</h2>
                <p style="color:#64748b; margin:5px 0;">تاريخ التقرير: ${todayStr} | حد التنبيه: أقل من ${LOW_STOCK_THRESHOLD} وحدة</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>كود الصنف</th>
                        <th>اسم الصنف</th>
                        <th>الكمية المتبقية</th>
                        <th>سعر الوحدة</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            <div class="no-print" style="margin-top:25px; text-align:center;">
                <button onclick="window.print()" style="background:#0284c7; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold;">🖨️ طباعة القائمة</button>
            </div>
        </body>
        </html>
    `);
    printWin.document.close();
};

// ===================== المخزون =====================
function renderInventory() {
    let tbody = document.getElementById('inventoryTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if(inventory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">لا توجد أصناف مسجلة</td></tr>`;
        return;
    }
    inventory.forEach((item, index) => {
        let lowClass = Number(item.qty) < LOW_STOCK_THRESHOLD ? 'style="color:#e11d48; font-weight:bold;"' : '';
        tbody.innerHTML += `
            <tr>
                <td>${item.code}</td>
                <td><bdi style="unicode-bidi: isolate; direction: auto;">${item.name}</bdi></td>
                <td ${lowClass}>${item.qty}</td>
                <td>${item.unit}</td>
                <td>${item.price.toLocaleString()} ج.م</td>
                <td>
                    <button onclick="openEditProductModal(${index})" class="btn-action btn-edit-sm"><i class="fas fa-edit"></i> تعديل</button>
                    <button onclick="deleteProduct(${index})" class="btn-action btn-danger-sm"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

window.filterInventory = function() {
    let searchInput = document.getElementById('searchInventory');
    if(!searchInput) return;
    let query = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('#inventoryTableBody tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
};

window.openAddProductModal = function() { document.getElementById('addProductModal').style.display = 'flex'; };
window.closeAddProductModal = function() { document.getElementById('addProductModal').style.display = 'none'; };

window.addNewProduct = function(e) {
    if(e) e.preventDefault();
    let code = document.getElementById('prodCode')?.value.trim();
    let name = document.getElementById('prodName')?.value.trim();
    let qty = Number(document.getElementById('prodQty')?.value);
    let unit = document.getElementById('prodUnit')?.value;
    let price = Number(document.getElementById('prodPrice')?.value);

    if(!code || !name) return;

    if(inventory.some(i => i.code === code)) {
        alert('هذا الكود مستخدم بالفعل لصنف آخر، برجاء اختيار كود مختلف.');
        return;
    }

    inventory.push({ code, name, qty, unit, price });
    saveData();
    refreshAllData();
    window.closeAddProductModal();
    if(e && e.target) e.target.reset();
};

window.deleteProduct = function(index) {
    if(confirm('هل أنت متأكد من حذف هذا الصنف؟')) {
        inventory.splice(index, 1);
        saveData();
        refreshAllData();
    }
};

window.openEditProductModal = function(index) {
    const product = inventory[index];
    if (!product) return;

    document.getElementById('editProdIndex').value = index;
    document.getElementById('editProdCode').value = product.code || '';
    document.getElementById('editProdName').value = product.name || '';
    document.getElementById('editProdQty').value = product.qty || 0;
    document.getElementById('editProdUnit').value = product.unit || '';
    document.getElementById('editProdPrice').value = product.price || 0;

    document.getElementById('editProductModal').style.display = 'flex';
};

window.closeEditProductModal = function() {
    document.getElementById('editProductModal').style.display = 'none';
};

window.saveEditedProduct = function(event) {
    event.preventDefault();

    const index = document.getElementById('editProdIndex').value;
    if (index === "" || !inventory[index]) return;

    inventory[index].code = document.getElementById('editProdCode').value.trim();
    inventory[index].name = document.getElementById('editProdName').value.trim();
    inventory[index].qty = Number(document.getElementById('editProdQty').value);
    inventory[index].unit = document.getElementById('editProdUnit').value;
    inventory[index].price = Number(document.getElementById('editProdPrice').value);

    saveData();
    refreshAllData();

    closeEditProductModal();
    alert('تم تعديل بيانات الصنف بنجاح!');
};

// ===================== المشتريات =====================
function renderPurchases() {
    let tbody = document.getElementById('purchasesTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if(purchases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">لا توجد عمليات شراء مسجلة</td></tr>`;
        return;
    }
    purchases.forEach((p, index) => {
        tbody.innerHTML += `
            <tr>
                <td>PO-${1000 + index}</td>
                <td>${p.supplier}</td>
                <td><bdi style="unicode-bidi: isolate; direction: auto;">${p.productName}</bdi></td>
                <td><span style="color: #10b981; font-weight: bold;">+${p.qty}</span></td>
                <td>${(p.unitCost || 0).toLocaleString()} ج.م</td>
                <td>${p.cost.toLocaleString()} ج.م</td>
                <td>${p.date}</td>
                <td><button class="btn-action btn-danger-sm" onclick="deletePurchase(${index})"><i class="fas fa-trash"></i> حذف</button></td>
            </tr>
        `;
    });
}

window.openNewPurchaseModal = function() { document.getElementById('newPurchaseModal').style.display = 'flex'; };
window.closeNewPurchaseModal = function() { document.getElementById('newPurchaseModal').style.display = 'none'; };

window.createNewPurchase = function(e) {
    if(e) e.preventDefault();
    let supplier = document.getElementById('purchaseSupplier')?.value;
    let prodCode = document.getElementById('purchaseProductSelect')?.value;
    let qty = Number(document.getElementById('purchaseQty')?.value);
    let totalCost = Number(document.getElementById('purchaseCost')?.value);
    let unitCost = qty > 0 ? (totalCost / qty) : 0;

    let product = inventory.find(i => i.code === prodCode);
    if(product) {
        product.qty += qty;
        purchases.push({
            supplier, productCode: product.code, productName: product.name,
            qty, unitCost, cost: totalCost, date: new Date().toLocaleDateString('ar-EG')
        });
        saveData();
        refreshAllData();
        window.closeNewPurchaseModal();
        if(e && e.target) e.target.reset();
        alert('تم تسجيل الشراء وزيادة المخزون بنجاح!');
    }
};

window.deletePurchase = function(index) {
    if(confirm('هل تريد حذف عملية الشراء هذه؟ سيتم خصم الكمية المضافة من المخزون.')) {
        let p = purchases[index];
        let product = inventory.find(i => i.code === p.productCode);
        if(product) {
            product.qty -= p.qty;
            if(product.qty < 0) product.qty = 0;
        }
        purchases.splice(index, 1);
        saveData();
        refreshAllData();
    }
};

// ===================== القوائم المنسدلة المشتركة =====================
function populateSelects() {
    let custSelect = document.getElementById('invoiceCustomerSelect');
    if(custSelect) {
        let currentVal = custSelect.value;
        custSelect.innerHTML = '<option value="">-- اختر عميل مسجل --</option>';
        customers.forEach(c => {
            custSelect.innerHTML += `<option value="${c.name}">${c.name} (${c.phone || 'بدون هاتف'})</option>`;
        });
        custSelect.innerHTML += `<option value="NEW_CUSTOMER" style="color: #0284c7; font-weight: bold;">+ إضافة عميل جديد...</option>`;
        if(currentVal) custSelect.value = currentVal;
    }

    let purProdSelect = document.getElementById('purchaseProductSelect');
    if(purProdSelect) {
        purProdSelect.innerHTML = '';
        inventory.forEach(i => {
            purProdSelect.innerHTML += `<option value="${i.code}">${i.name}</option>`;
        });
    }
}

// نُظهر تلقائياً لو العميل ده عليه فلوس ولا له رصيد، ونديله اختيار إنه يضمّه للفاتورة الحالية أو لأ
window.handleCustomerSelectChange = function() {
    let val = document.getElementById('invoiceCustomerSelect')?.value;
    let newDiv = document.getElementById('newCustomerDiv');
    if(newDiv) newDiv.style.display = (val === 'NEW_CUSTOMER') ? 'block' : 'none';

    let infoBox = document.getElementById('custDebtInfoBox');
    let includeRow = document.getElementById('includeOldBalanceRow');
    let checkbox = document.getElementById('includeOldBalanceCheckbox');
    let label = document.getElementById('includeOldBalanceLabel');

    // تصفير حقول الرصيد السابق المخفية أول ما نغيّر العميل، لحد ما يفعّل الـ checkbox
    document.getElementById('invoiceOldBalance').value = 0;
    document.getElementById('invoiceOldBalanceType').value = 'none';
    document.getElementById('invoiceOldBalanceDate').value = '';
    if(checkbox) checkbox.checked = false;

    window.__selectedCustomerNetDebt = 0;

    if(val && val !== 'NEW_CUSTOMER') {
        let netDebt = getCustomerNetDebt(val);
        window.__selectedCustomerNetDebt = netDebt;

        if(infoBox) {
            infoBox.style.display = 'block';
            if(netDebt > 0.001) {
                infoBox.style.background = '#fef2f2';
                infoBox.style.color = '#b91c1c';
                infoBox.style.border = '1px solid #fecaca';
                infoBox.innerHTML = `<i class="fas fa-triangle-exclamation"></i> هذا العميل عليه مبلغ سابق مستحق: ${netDebt.toLocaleString()} ج.م
                    <button type="button" onclick="closeCustomerOldBalanceFromInvoice('${val.replace(/'/g, "\\'")}')" style="float:left; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; font-weight:bold;"><i class="fas fa-xmark"></i> إقفال الحساب السابق</button>`;
                if(includeRow) includeRow.style.display = 'flex';
                if(label) label.innerText = 'إضافة هذا المبلغ (عليه) إلى إجمالي الفاتورة الحالية';
            } else if(netDebt < -0.001) {
                infoBox.style.background = '#f0fdf4';
                infoBox.style.color = '#166534';
                infoBox.style.border = '1px solid #bbf7d0';
                infoBox.innerHTML = `<i class="fas fa-circle-check"></i> هذا العميل له رصيد سابق: ${Math.abs(netDebt).toLocaleString()} ج.م
                    <button type="button" onclick="closeCustomerOldBalanceFromInvoice('${val.replace(/'/g, "\\'")}')" style="float:left; background:#dcfce7; color:#166534; border:1px solid #86efac; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; font-weight:bold;"><i class="fas fa-xmark"></i> إقفال الحساب السابق</button>`;
                if(includeRow) includeRow.style.display = 'flex';
                if(label) label.innerText = 'خصم هذا الرصيد (له) من إجمالي الفاتورة الحالية';
            } else {
                infoBox.style.background = '#f8fafc';
                infoBox.style.color = '#475569';
                infoBox.style.border = '1px solid #e2e8f0';
                infoBox.innerHTML = `<i class="fas fa-circle-info"></i> لا يوجد أي رصيد أو مديونية سابقة على هذا العميل.`;
                if(includeRow) includeRow.style.display = 'none';
            }
        }
    } else {
        if(infoBox) infoBox.style.display = 'none';
        if(includeRow) includeRow.style.display = 'none';
    }

    invoicePaidManuallyEdited = false;
    calculateInvoiceTotal();
};

// تفعيل/إلغاء تضمين الرصيد السابق (المكتشف تلقائياً) في الفاتورة الحالية
window.toggleIncludeOldBalance = function() {
    let checkbox = document.getElementById('includeOldBalanceCheckbox');
    let netDebt = Number(window.__selectedCustomerNetDebt || 0);
    let custName = document.getElementById('invoiceCustomerSelect')?.value;
    let cust = customers.find(c => c.name === custName);

    if(checkbox && checkbox.checked && netDebt !== 0) {
        document.getElementById('invoiceOldBalance').value = Math.abs(netDebt);
        document.getElementById('invoiceOldBalanceType').value = netDebt > 0 ? 'on_him' : 'for_him';
        document.getElementById('invoiceOldBalanceDate').value = (cust && cust.oldBalanceDate) || new Date().toLocaleDateString('ar-EG');
    } else {
        document.getElementById('invoiceOldBalance').value = 0;
        document.getElementById('invoiceOldBalanceType').value = 'none';
        document.getElementById('invoiceOldBalanceDate').value = '';
    }
    invoicePaidManuallyEdited = false;
    calculateInvoiceTotal();
};

// المستخدم غيّر "المبلغ المدفوع" يدوياً - نوقف المتابعة التلقائية للإجمالي ونحدّث رسالة الحالة فقط
window.handlePaidAmountManualEdit = function() {
    invoicePaidManuallyEdited = true;
    calculateInvoiceTotal();
};

// رسالة واضحة تحت خانة الدفع: هيفضل عليه كام، ولا دفع زيادة، ولا اتسدد بالكامل
function updatePaymentStatusDisplay(grandTotal) {
    let paidInput = document.getElementById('invoicePaidAmountInput');
    let statusBox = document.getElementById('invoicePaymentStatusDisplay');
    if(!paidInput || !statusBox) return;
    let paid = Number(paidInput.value) || 0;
    let diff = grandTotal - paid;

    if(diff > 0.5) {
        statusBox.innerHTML = `<span style="color:#dc2626;"><i class="fas fa-arrow-down"></i> سيتبقى عليه: ${diff.toLocaleString()} ج.م (يُسجَّل عليه في حساباته)</span>`;
    } else if(diff < -0.5) {
        statusBox.innerHTML = `<span style="color:#059669;"><i class="fas fa-arrow-up"></i> دفع زيادة: ${Math.abs(diff).toLocaleString()} ج.م (تُخصم كرصيد له في حساباته)</span>`;
    } else {
        statusBox.innerHTML = `<span style="color:#059669;"><i class="fas fa-circle-check"></i> تم السداد بالكامل، الحساب مضبوط.</span>`;
    }
}

// ===================== كومبو بحث قابل لإعادة الاستخدام (عميل / صنف) =====================
// بيغلف أي <select> بمربع بحث نصي، من غير ما يأثر على قيمة الـ select نفسه أو أي كود بيعتمد عليه
function attachSearchableSelect(selectEl, placeholder) {
    if(!selectEl || selectEl.dataset.searchAttached === '1') return;
    selectEl.dataset.searchAttached = '1';
    selectEl.style.display = 'none';

    let wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.width = '100%';

    let input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || 'ابحث...';
    input.setAttribute('dir', 'auto');
    input.autocomplete = 'off';
    input.style.cssText = 'width:100%; padding:10px; background:#fff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; font-size:14px; box-sizing:border-box;';

    let list = document.createElement('div');
    list.style.cssText = 'display:none; position:absolute; z-index:80; top:100%; right:0; left:0; background:#fff; border:1px solid #cbd5e1; border-radius:8px; max-height:220px; overflow-y:auto; margin-top:2px; box-shadow:0 10px 25px rgba(15,23,42,0.15);';

    wrap.appendChild(input);
    wrap.appendChild(list);
    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);

    function syncInputFromSelect() {
        let opt = selectEl.options[selectEl.selectedIndex];
        input.value = (opt && opt.value) ? opt.textContent : '';
    }
    function renderList(filter) {
        let q = (filter || '').trim().toLowerCase();
        let matches = Array.from(selectEl.options).filter(o => o.value && o.textContent.toLowerCase().includes(q));
        list.innerHTML = '';
        if(matches.length === 0) {
            list.innerHTML = '<div style="padding:9px; color:#64748b; font-size:12.5px;">لا توجد نتائج مطابقة</div>';
        } else {
            matches.slice(0, 80).forEach(o => {
                let item = document.createElement('div');
                item.textContent = o.textContent;
                item.style.cssText = 'padding:9px 10px; cursor:pointer; font-size:13px; border-bottom:1px solid #f1f5f9; color:#0f172a;';
                item.onmousedown = (e) => {
                    e.preventDefault();
                    selectEl.value = o.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    input.value = o.textContent;
                    list.style.display = 'none';
                };
                item.onmouseenter = () => item.style.background = '#f0f9ff';
                item.onmouseleave = () => item.style.background = 'transparent';
                list.appendChild(item);
            });
        }
        list.style.display = 'block';
    }
    input.addEventListener('focus', () => renderList(''));
    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; syncInputFromSelect(); }, 150));

    syncInputFromSelect();
    selectEl._comboSync = syncInputFromSelect;
}
window.attachSearchableSelect = attachSearchableSelect;

// ===================== إنشاء / تعديل الفاتورة =====================
window.addInvoiceItemRow = function(selectedCode = '', selectedQty = 1) {
    let tbody = document.getElementById('invoiceItemsBody');
    if(!tbody) return;

    let optionsHtml = '<option value="">-- اختر الصنف من المخزون --</option>';
    inventory.forEach(i => {
        let isSelected = (i.code === selectedCode) ? 'selected' : '';
        optionsHtml += `<option value="${i.code}" data-price="${i.price}" data-qty="${i.qty}" ${isSelected}>${i.name} (المتاح: ${i.qty} ${i.unit} - ${i.price} ج.م)</option>`;
    });

    let tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="padding: 5px;"><select class="inv-item-code" dir="auto" style="width:100%; padding:6px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;" onchange="updateRowPrice(this)">${optionsHtml}</select></td>
        <td style="padding: 5px;"><input type="number" class="inv-item-qty" value="${selectedQty}" min="1" style="width:100%; padding:6px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px; text-align:center;" oninput="calculateInvoiceTotal()"></td>
        <td style="padding: 5px;"><input type="number" class="inv-item-price" value="0" style="width:100%; padding:6px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px; text-align:center;" oninput="calculateInvoiceTotal()"></td>
        <td style="padding: 5px; text-align:center; font-weight:bold; color:#38bdf8; font-size:13px;" class="inv-item-total-cell">0 ج.م</td>
        <td style="padding: 5px; text-align: center;"><button type="button" onclick="this.closest('tr').remove(); calculateInvoiceTotal();" style="background:#f43f5e; color:#fff; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;"><i class="fas fa-trash"></i></button></td>
    `;
    tbody.appendChild(tr);

    let selectEl = tr.querySelector('.inv-item-code');
    if(selectedCode && selectEl) {
        window.updateRowPrice(selectEl);
    }
    if(selectEl) attachSearchableSelect(selectEl, 'ابحث عن الصنف بالاسم...');
    calculateInvoiceTotal();
    return tr;
};
window.updateRowPrice = function(selectElem) {
    let opt = selectElem.options[selectElem.selectedIndex];
    let price = opt ? opt.getAttribute('data-price') : 0;
    let tr = selectElem.closest('tr');
    if(tr) {
        let priceInput = tr.querySelector('.inv-item-price');
        if(priceInput) priceInput.value = price;
    }
    calculateInvoiceTotal();
};

window.calculateInvoiceTotal = function() {
    let rows = document.querySelectorAll('#invoiceItemsBody tr');
    let subtotal = 0;

    rows.forEach(tr => {
        let qty = Number(tr.querySelector('.inv-item-qty')?.value) || 0;
        let price = Number(tr.querySelector('.inv-item-price')?.value) || 0;
        let lineTotal = qty * price;
        subtotal += lineTotal;
        let totalCell = tr.querySelector('.inv-item-total-cell');
        if(totalCell) totalCell.innerText = lineTotal.toLocaleString() + ' ج.م';
    });

    let discountPercent = Number(document.getElementById('invoiceDiscountPercent')?.value) || 0;
    let discountAmount = (subtotal * discountPercent) / 100;
    let netAfterDiscount = subtotal - discountAmount;

    let oldBalance = Number(document.getElementById('invoiceOldBalance')?.value) || 0;
    let oldBalanceType = document.getElementById('invoiceOldBalanceType')?.value;

    let finalTotal = netAfterDiscount;
    if(oldBalanceType === 'on_him') {
        finalTotal += oldBalance;
    } else if(oldBalanceType === 'for_him') {
        finalTotal -= oldBalance;
    }

    let display = document.getElementById('invoiceFinalTotalDisplay');
    if(display) display.innerText = finalTotal.toLocaleString() + ' ج.م';

    // لو المستخدم لسه ما لمسش خانة "المبلغ المدفوع" يدوياً، نتابعها تلقائياً على أساس افتراض السداد الكامل
    let paidInput = document.getElementById('invoicePaidAmountInput');
    if(paidInput && !invoicePaidManuallyEdited) {
        paidInput.value = finalTotal > 0 ? finalTotal : 0;
    }
    updatePaymentStatusDisplay(finalTotal);

    return finalTotal;
};

window.openNewInvoiceModal = function() {
    // وضع الإنشاء الجديد (وليس التعديل)
    document.getElementById('editingInvoiceIndex').value = '';
    document.getElementById('invoiceFormTitle').innerHTML = '<i class="fas fa-file-invoice-dollar"></i> إنشاء فاتورة مبيعات جديدة';
    document.getElementById('invoiceSubmitBtn').innerHTML = '<i class="fas fa-save"></i> حفظ وعرض الفاتورة';

    let modal = document.getElementById('newInvoiceModal');
    if(modal) modal.style.display = 'flex';
    populateSelects();

    let custSelect = document.getElementById('invoiceCustomerSelect');
    if(custSelect) {
        attachSearchableSelect(custSelect, 'ابحث باسم العميل أو رقم الهاتف...');
        custSelect.value = '';
        if(custSelect._comboSync) custSelect._comboSync();
    }
    let newDiv = document.getElementById('newCustomerDiv');
    if(newDiv) newDiv.style.display = 'none';

    let tbody = document.getElementById('invoiceItemsBody');
    if(tbody) {
        tbody.innerHTML = '';
        window.addInvoiceItemRow();
    }

    let disc = document.getElementById('invoiceDiscountPercent');
    if(disc) disc.value = 0;
    let oldBal = document.getElementById('invoiceOldBalance');
    if(oldBal) oldBal.value = 0;
    let oldBalType = document.getElementById('invoiceOldBalanceType');
    if(oldBalType) oldBalType.value = 'none';
    let oldBalDate = document.getElementById('invoiceOldBalanceDate');
    if(oldBalDate) oldBalDate.value = '';

    let infoBox = document.getElementById('custDebtInfoBox');
    if(infoBox) infoBox.style.display = 'none';
    let includeRow = document.getElementById('includeOldBalanceRow');
    if(includeRow) includeRow.style.display = 'none';
    let checkbox = document.getElementById('includeOldBalanceCheckbox');
    if(checkbox) checkbox.checked = false;
    window.__selectedCustomerNetDebt = 0;

    invoicePaidManuallyEdited = false;
    let paidInput = document.getElementById('invoicePaidAmountInput');
    if(paidInput) paidInput.value = 0;

    calculateInvoiceTotal();
};

window.closeNewInvoiceModal = function() { document.getElementById('newInvoiceModal').style.display = 'none'; };

// فتح الفاتورة الحالية للتعديل الكامل (الأصناف، الخصم، حالة الدفع...)
window.openEditInvoiceModal = function(index) {
    let inv = invoices[index];
    if(!inv) return;

    populateSelects();

    document.getElementById('editingInvoiceIndex').value = index;
    document.getElementById('invoiceFormTitle').innerHTML = `<i class="fas fa-edit"></i> تعديل الفاتورة رقم ${inv.id}`;
    document.getElementById('invoiceSubmitBtn').innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';

    let modal = document.getElementById('newInvoiceModal');
    if(modal) modal.style.display = 'flex';

    let custSelect = document.getElementById('invoiceCustomerSelect');
    let newDiv = document.getElementById('newCustomerDiv');
    let custExists = customers.some(c => c.name === inv.customerName);
    if(custSelect) {
        attachSearchableSelect(custSelect, 'ابحث باسم العميل أو رقم الهاتف...');
        custSelect.value = custExists ? inv.customerName : 'NEW_CUSTOMER';
        if(custSelect._comboSync) custSelect._comboSync();
    }
    if(newDiv) {
        newDiv.style.display = custExists ? 'none' : 'block';
        if(!custExists) {
            document.getElementById('newCustomerName').value = inv.customerName || '';
            document.getElementById('newCustomerPhone').value = inv.customerPhone || '';
            document.getElementById('newCustomerAddress').value = inv.customerAddress || '';
        }
    }

    let tbody = document.getElementById('invoiceItemsBody');
    tbody.innerHTML = '';
    (inv.items || []).forEach(item => {
        let tr = window.addInvoiceItemRow(item.code, item.qty);
        let priceInput = tr.querySelector('.inv-item-price');
        if(priceInput) priceInput.value = item.price; // نحافظ على السعر الأصلي وقت البيع
    });

    document.getElementById('invoiceDiscountPercent').value = inv.discountPercent || 0;
    document.getElementById('invoiceOldBalance').value = inv.oldBalance || 0;
    document.getElementById('invoiceOldBalanceType').value = inv.oldBalanceType || 'none';
    document.getElementById('invoiceOldBalanceDate').value = inv.oldBalanceDate || '';

    // نعرض حالة الرصيد السابق المُضمَّن أصلاً في هذه الفاتورة (لو موجود) مع السماح بإلغائه أو تعديله
    let infoBox = document.getElementById('custDebtInfoBox');
    let includeRow = document.getElementById('includeOldBalanceRow');
    let checkbox = document.getElementById('includeOldBalanceCheckbox');
    let label = document.getElementById('includeOldBalanceLabel');
    let hasOldBal = inv.oldBalanceType && inv.oldBalanceType !== 'none' && Number(inv.oldBalance) > 0;

    window.__selectedCustomerNetDebt = hasOldBal ? (inv.oldBalanceType === 'on_him' ? Number(inv.oldBalance) : -Number(inv.oldBalance)) : 0;

    if(hasOldBal) {
        infoBox.style.display = 'block';
        if(inv.oldBalanceType === 'on_him') {
            infoBox.style.background = '#fef2f2'; infoBox.style.color = '#b91c1c'; infoBox.style.border = '1px solid #fecaca';
            infoBox.innerHTML = `<i class="fas fa-triangle-exclamation"></i> هذه الفاتورة تتضمن رصيد سابق عليه: ${Number(inv.oldBalance).toLocaleString()} ج.م`;
            if(label) label.innerText = 'إضافة هذا المبلغ (عليه) إلى إجمالي الفاتورة الحالية';
        } else {
            infoBox.style.background = '#f0fdf4'; infoBox.style.color = '#166534'; infoBox.style.border = '1px solid #bbf7d0';
            infoBox.innerHTML = `<i class="fas fa-circle-check"></i> هذه الفاتورة تتضمن رصيد سابق له: ${Number(inv.oldBalance).toLocaleString()} ج.م`;
            if(label) label.innerText = 'خصم هذا الرصيد (له) من إجمالي الفاتورة الحالية';
        }
        includeRow.style.display = 'flex';
        checkbox.checked = true;
    } else {
        infoBox.style.display = 'none';
        includeRow.style.display = 'none';
        checkbox.checked = false;
    }

    invoicePaidManuallyEdited = true; // نحافظ على قيمة "المدفوع" الأصلية بدل ما نعيد حسابها تلقائياً
    let paidInput = document.getElementById('invoicePaidAmountInput');
    if(paidInput) paidInput.value = inv.paid || 0;

    calculateInvoiceTotal();
};

window.createNewInvoice = function(e) {
    if(e) e.preventDefault();

    let editingIndexRaw = document.getElementById('editingInvoiceIndex')?.value;
    let isEditing = editingIndexRaw !== '' && editingIndexRaw !== undefined && editingIndexRaw !== null;
    let editingIndex = isEditing ? Number(editingIndexRaw) : null;

    let customerSelectVal = document.getElementById('invoiceCustomerSelect')?.value;
    let customerName = customerSelectVal;
    let customerPhone = '';
    let customerAddress = '';

    if(customerSelectVal === 'NEW_CUSTOMER') {
        customerName = document.getElementById('newCustomerName')?.value.trim();
        customerPhone = document.getElementById('newCustomerPhone')?.value.trim();
        customerAddress = document.getElementById('newCustomerAddress')?.value.trim();
        if(!customerName) {
            alert('يرجى إدخال اسم العميل الجديد!');
            return;
        }
        if(!customers.some(c => c.name === customerName)) {
            customers.push({ name: customerName, phone: customerPhone, address: customerAddress, oldBalance: 0, balanceType: 'none', oldBalanceDate: '' });
        }
    } else {
        if(!customerSelectVal) {
            alert('يرجى اختيار عميل أو إضافة عميل جديد!');
            return;
        }
        let foundCust = customers.find(c => c.name === customerSelectVal);
        if(foundCust) {
            customerPhone = foundCust.phone;
            customerAddress = foundCust.address;
        }
    }

    let rows = document.querySelectorAll('#invoiceItemsBody tr');
    if(rows.length === 0) {
        alert('يرجى إضافة صنف واحد على الأقل للفاتورة!');
        return;
    }

    // لو بنعدل فاتورة موجودة، أول حاجة نرجع كمية أصنافها القديمة للمخزون مؤقتاً
    // عشان نقدر نتحقق من الكمية المتاحة بشكل صحيح مع الكميات الجديدة
    let originalItemsBackup = null;
    if(isEditing && invoices[editingIndex]) {
        originalItemsBackup = invoices[editingIndex].items;
        originalItemsBackup.forEach(oldItem => {
            let prodObj = inventory.find(i => i.code === oldItem.code);
            if(prodObj) prodObj.qty = Number(prodObj.qty) + Number(oldItem.qty);
        });

        // لو الفاتورة القديمة كانت ماصّة رصيد سابق للعميل وقت إنشائها (وتم تصفيره وقتها)،
        // نرجّعه الأول عشان نعيد حساب كل حاجة من الصفر بدون أي ازدواج أو ضياع في الأرقام
        let prevInv = invoices[editingIndex];
        if(prevInv.oldBalanceType && prevInv.oldBalanceType !== 'none' && Number(prevInv.oldBalance) > 0) {
            let custRecord = customers.find(cc => cc.name === prevInv.customerName);
            if(custRecord && (!custRecord.oldBalance || custRecord.oldBalance == 0)) {
                custRecord.oldBalance = Number(prevInv.oldBalance);
                custRecord.balanceType = prevInv.oldBalanceType;
                custRecord.oldBalanceDate = prevInv.oldBalanceDate || prevInv.date;
            }
        }
    }

    let items = [];
    let subtotal = 0;

    for(let tr of rows) {
        let selectEl = tr.querySelector('.inv-item-code');
        if(!selectEl || !selectEl.value) {
            alert('يرجى اختيار صنف صحيح في كل السطور!');
            if(originalItemsBackup) originalItemsBackup.forEach(oldItem => {
                let prodObj = inventory.find(i => i.code === oldItem.code);
                if(prodObj) prodObj.qty = Number(prodObj.qty) - Number(oldItem.qty);
            });
            return;
        }
        let prodCode = selectEl.value;
        let qty = Number(tr.querySelector('.inv-item-qty').value);
        let price = Number(tr.querySelector('.inv-item-price').value);

        let prodObj = inventory.find(i => i.code === prodCode);

        if(!prodObj) {
            alert(`الصنف المحدد غير موجود في المخزون!`);
            if(originalItemsBackup) originalItemsBackup.forEach(oldItem => {
                let p2 = inventory.find(i => i.code === oldItem.code);
                if(p2) p2.qty = Number(p2.qty) - Number(oldItem.qty);
            });
            return;
        }

        if(qty > prodObj.qty) {
            alert(`الكمية المطلوبة للصنف (${prodObj.name}) أكبر من المتاح في المخزون (${prodObj.qty})!`);
            if(originalItemsBackup) originalItemsBackup.forEach(oldItem => {
                let p2 = inventory.find(i => i.code === oldItem.code);
                if(p2) p2.qty = Number(p2.qty) - Number(oldItem.qty);
            });
            return;
        }

        let itemTotal = qty * price;
        subtotal += itemTotal;
        items.push({ code: prodObj.code, name: prodObj.name, qty, price, total: itemTotal });
    }

    let discountPercent = Number(document.getElementById('invoiceDiscountPercent')?.value) || 0;
    let discountAmount = (subtotal * discountPercent) / 100;
    let netAfterDiscount = subtotal - discountAmount;

    let oldBalance = Number(document.getElementById('invoiceOldBalance')?.value) || 0;
    let oldBalanceType = document.getElementById('invoiceOldBalanceType')?.value;
    let oldBalanceDate = document.getElementById('invoiceOldBalanceDate')?.value || '';

    let finalTotal = netAfterDiscount;
    if(oldBalanceType === 'on_him') finalTotal += oldBalance;
    else if(oldBalanceType === 'for_him') finalTotal -= oldBalance;

    // المبلغ اللي دفعه العميل فعلياً (كاش) بيتحدد من خانة واحدة بس، والمتبقي/الزيادة بيتحسبوا تلقائياً
    // موجب = لسه متبقي عليه / سالب = دفع زيادة (بتتحول لرصيد له تلقائياً في دليل العملاء)
    let paidAmount = Number(document.getElementById('invoicePaidAmountInput')?.value) || 0;
    if(paidAmount < 0) paidAmount = 0;
    let remainingAmount = finalTotal - paidAmount;
    let paymentStatusLabel = remainingAmount > 0.5
        ? `متبقي: ${remainingAmount.toLocaleString()} ج.م`
        : (remainingAmount < -0.5 ? `دفع زيادة: ${Math.abs(remainingAmount).toLocaleString()} ج.م (رصيد له)` : 'تم الدفع بالكامل');

    // خصم الكميات الجديدة فعلياً من المخزون (كل صنف يقل من مكانه الصحيح)
    items.forEach(item => {
        let prodObj = inventory.find(i => i.code === item.code);
        if(prodObj) {
            prodObj.qty = Number(prodObj.qty) - Number(item.qty);
            if(prodObj.qty < 0) prodObj.qty = 0;
        }
    });

    let finalInvoiceObj;

    if(isEditing && invoices[editingIndex]) {
        let existing = invoices[editingIndex];
        finalInvoiceObj = {
            ...existing,
            customerName, customerPhone, customerAddress,
            items, subtotal, discountPercent, discountAmount,
            oldBalance, oldBalanceType, oldBalanceDate,
            total: finalTotal, paid: paidAmount, remaining: remainingAmount,
            // المدفوع وقت الإنشاء = المدفوع الكلي ناقص أي سداد/ترحيل سُجّل بعد كده (عشان كشف الحساب يعرف دفع ساعتها كام)
            initialPaid: Math.max(0, paidAmount - sumOf(existing.paymentHistory || [], p => p.amount)),
            status: paymentStatusLabel,
            // نحافظ على تاريخ الإصدار الأصلي (dateISO) عشان حساب أيام التأخير يفضل دقيق حتى بعد التعديل
            dateISO: existing.dateISO || new Date().toISOString(),
            lastEditedDate: new Date().toLocaleDateString('ar-EG')
        };
        invoices[editingIndex] = finalInvoiceObj;
    } else {
        let invoiceId = 'INV-' + Math.floor(1000 + Math.random() * 9000);
        let nowDate = new Date();
        let currentDate = nowDate.toLocaleDateString('ar-EG');
        finalInvoiceObj = {
            id: invoiceId, customerName, customerPhone, customerAddress,
            items, subtotal, discountPercent, discountAmount,
            oldBalance, oldBalanceType, oldBalanceDate,
            total: finalTotal, paid: paidAmount, remaining: remainingAmount,
            initialPaid: paidAmount, // المدفوع وقت إصدار الفاتورة (ثابت، لا يتغير بالسداد اللاحق)
            status: paymentStatusLabel,
            date: currentDate,
            dateISO: nowDate.toISOString() // تاريخ دقيق (ISO) يُستخدم لحساب عدد أيام التأخير بدقة في كشف الحساب
        };
        invoices.push(finalInvoiceObj);
    }

    // مهم جداً: لو الفاتورة دي استوعبت "حساب سابق" للعميل (عليه أو له)، بقى هذا الرصيد
    // جزء من إجمالي الفاتورة نفسها (total/remaining) من دلوقتي. لازم:
    // 1) نصفّر رصيد العميل المستقل عشان منحسبوش مرتين
    // 2) نُسوّي (نُصفّر المتبقي في) كل فواتيره التانية السابقة، لأن دينها بقى ممثَّل جوه الفاتورة دي بالظبط
    if(oldBalanceType && oldBalanceType !== 'none' && oldBalance > 0) {
        let custRecord = customers.find(cc => cc.name === customerName);
        if(custRecord) {
            custRecord.oldBalance = 0;
            custRecord.balanceType = 'none';
            custRecord.oldBalanceDate = '';
        }

        let currentInvoiceRef = finalInvoiceObj;
        let carriedNow = new Date();
        let carriedInvoices = [];
        invoices.forEach(otherInv => {
            if(otherInv !== currentInvoiceRef && otherInv.customerName === customerName && Number(otherInv.remaining || 0) !== 0) {
                // نثبّت تفاصيل الفاتورة القديمة قبل ما نسوّيها: دفع ساعتها كام + المبلغ اللي اتنقل للفاتورة الجديدة
                if(otherInv.initialPaid == null) otherInv.initialPaid = invBreakdown(otherInv).initial;
                let carriedAmt = Number(otherInv.remaining || 0);
                if(!otherInv.paymentHistory) otherInv.paymentHistory = [];
                otherInv.paymentHistory.push({
                    amount: carriedAmt, type: 'carried', toInvoice: currentInvoiceRef.id,
                    date: carriedNow.toLocaleString('ar-EG'), dateISO: carriedNow.toISOString(),
                    note: `رُحّل إلى الفاتورة ${currentInvoiceRef.id} (ضمن تسوية رصيد سابق)`
                });
                carriedInvoices.push({ id: otherInv.id, amount: carriedAmt });
                otherInv.paid = Number(otherInv.total);
                otherInv.remaining = 0;
                otherInv.status = 'تم الدفع بالكامل (ضمن تسوية رصيد سابق)';
            }
        });
        if(carriedInvoices.length) currentInvoiceRef.carriedInvoices = carriedInvoices;
    }

    saveData();
    refreshAllData();
    window.closeNewInvoiceModal();
    window.showInvoiceModal(finalInvoiceObj);
};

// ===================== عرض جدول الفواتير =====================
function renderInvoices() {
    let tbody = document.getElementById('invoicesTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';

    if(invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">لا توجد فواتير مسجلة بعد</td></tr>`;
        return;
    }

    invoices.slice().reverse().forEach((inv, revIndex) => {
        let index = invoices.length - 1 - revIndex;
        let statusBadge = (inv.remaining > 0)
            ? `<span class="badge-danger"><i class="fas fa-arrow-down"></i> متبقي: ${inv.remaining.toLocaleString()} ج.م</span>`
            : `<span class="badge-success"><i class="fas fa-arrow-up"></i> تم الدفع بالكامل</span>`;
        let invString = encodeURIComponent(JSON.stringify(inv));

        tbody.innerHTML += `
            <tr>
                <td><strong>${inv.id}</strong></td>
                <td>${inv.customerName}</td>
                <td>${inv.date}</td>
                <td>${inv.total.toLocaleString()} ج.م</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="row-actions">
                        <button onclick='showInvoiceModalEncoded("${invString}")' class="btn-action btn-view-sm" title="معاينة"><i class="fas fa-eye"></i></button>
                        <button onclick="openEditInvoiceModal(${index})" class="btn-action btn-edit-sm" title="تعديل الفاتورة كاملة"><i class="fas fa-edit"></i> تعديل</button>
                        <button onclick="openInvoicePaymentByIndex(${index})" class="btn-action btn-pay-sm" title="تسجيل سداد"><i class="fas fa-hand-holding-usd"></i></button>
                        <button onclick="deleteInvoice(${index})" class="btn-action btn-danger-sm" title="حذف (يرجع المخزون)"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.filterInvoices = function() {
    let query = document.getElementById('searchInvoices')?.value.toLowerCase().trim() || '';
    document.querySelectorAll('#invoicesTableBody tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
};

// حذف الفاتورة مع إرجاع كل منتج بكميته الصحيحة إلى المخزون
window.deleteInvoice = function(index) {
    let inv = invoices[index];
    if(!inv) return;
    if(confirm(`هل تريد حذف الفاتورة رقم ${inv.id}؟ سيتم إرجاع كل منتج بكميته إلى المخزون تلقائياً.`)) {
        (inv.items || []).forEach(item => {
            let prodObj = inventory.find(i => i.code === item.code);
            if(prodObj) {
                prodObj.qty = Number(prodObj.qty) + Number(item.qty);
            } else {
                // لو الصنف اتحذف من المخزون الأساسي، نعيد إضافته برصيده الراجع
                inventory.push({ code: item.code, name: item.name, qty: Number(item.qty), unit: 'قطعة', price: item.price });
            }
        });

        // لو الفاتورة دي كانت استوعبت "حساب سابق" للعميل وقت إصدارها (وتم تصفير رصيده وقتها)،
        // لازم نرجّع هذا الحساب القديم تاني لملف العميل عشان الدين ميضيعش عند الحذف
        if(inv.oldBalanceType && inv.oldBalanceType !== 'none' && Number(inv.oldBalance) > 0) {
            let custRecord = customers.find(cc => cc.name === inv.customerName);
            if(custRecord && (!custRecord.oldBalance || custRecord.oldBalance == 0)) {
                custRecord.oldBalance = Number(inv.oldBalance);
                custRecord.balanceType = inv.oldBalanceType;
                custRecord.oldBalanceDate = inv.oldBalanceDate || inv.date;
            }
        }

        invoices.splice(index, 1);
        saveData();
        refreshAllData();
        alert('تم حذف الفاتورة، وإرجاع كل منتج بكميته إلى المخزون، وإرجاع أي حساب سابق كان مرتبط بها بنجاح!');
    }
};

// (دليل العملاء الجديد موجود في قسم v3 بآخر الملف)

window.openAddCustomerModal = function() { document.getElementById('addCustomerModal').style.display = 'flex'; };
window.closeAddCustomerModal = function() { document.getElementById('addCustomerModal').style.display = 'none'; };

window.addNewCustomerDirect = function(e) {
    if(e) e.preventDefault();
    let name = document.getElementById('custName')?.value.trim();
    let phone = document.getElementById('custPhone')?.value.trim();
    let address = document.getElementById('custAddress')?.value.trim();
    let oldBalance = Number(document.getElementById('custOldBalance')?.value) || 0;
    let balanceType = document.getElementById('custBalanceType')?.value || 'none';

    if(!name) return;
    if(customers.some(c => c.name === name)) {
        alert('هذا العميل مسجل مسبقاً!');
        return;
    }

    customers.push({ name, phone, address, oldBalance, balanceType, oldBalanceDate: new Date().toLocaleDateString('ar-EG') });
    saveData();
    refreshAllData();
    window.closeAddCustomerModal();
    if(e && e.target) e.target.reset();
    alert('تم حفظ العميل بنجاح!');
};

// تعديل بيانات العميل كاملة (اسم، هاتف، عنوان، حساب سابق) وليس فقط الديون
window.openEditCustomerModal = function(index) {
    let c = customers[index];
    if(!c) return;
    document.getElementById('editCustIndex').value = index;
    document.getElementById('editCustName').value = c.name || '';
    document.getElementById('editCustPhone').value = c.phone || '';
    document.getElementById('editCustAddress').value = c.address || '';
    document.getElementById('editCustOldBalance').value = c.oldBalance || 0;
    document.getElementById('editCustBalanceType').value = c.balanceType || 'none';
    document.getElementById('editCustOldBalanceDate').value = c.oldBalanceDate || '';
    document.getElementById('editCustomerModal').style.display = 'flex';
};

window.closeEditCustomerModal = function() {
    document.getElementById('editCustomerModal').style.display = 'none';
};

// مسح الحساب السابق (المنفصل) بالكامل لعميل معين، عشان يقدر المستخدم يدخل الرصيد الصحيح من غير ما يتراكم فوق رقم غلط
window.resetCustomerOldBalance = function() {
    let index = document.getElementById('editCustIndex').value;
    let c = customers[index];
    if(!c) return;
    if(!confirm(`هل أنت متأكد من مسح "الحساب السابق" المسجل بشكل منفصل لهذا العميل (${c.name})؟\n\nملحوظة: هذا لن يمسح فواتيره أو مشترياته، وإنما يصفّر فقط أي رصيد سابق مستقل كان مُدخلاً يدوياً، عشان تقدر تدخل الرقم الصحيح من جديد بدون ما يتجمع فوق رقم قديم غلط.`)) return;

    c.oldBalance = 0;
    c.balanceType = 'none';
    c.oldBalanceDate = '';

    document.getElementById('editCustOldBalance').value = 0;
    document.getElementById('editCustBalanceType').value = 'none';
    document.getElementById('editCustOldBalanceDate').value = '';

    saveData();
    refreshAllData();
    alert('تم مسح الحساب السابق بالكامل. دلوقتي تقدر تدخل الرصيد الصحيح وتضغط "حفظ التعديلات".');
};

// إقفال سريع للحساب السابق (الرصيد المستقل فقط) من نفس شاشة إنشاء الفاتورة، بدون الحاجة للدخول لتعديل العميل
window.closeCustomerOldBalanceFromInvoice = function(customerName) {
    let c = customers.find(cc => cc.name === customerName);
    if(!c) return;
    if(!confirm(`هل تريد إقفال "الحساب السابق" المسجل بشكل منفصل لهذا العميل (${c.name})؟\n\nملحوظة: لو عليه فواتير سابقة لسه متبقي منها مبالغ، هتفضل ظاهرة في مديونيته لأنها مبنية على فواتير فعلية وليست رصيد يدوي.`)) return;

    c.oldBalance = 0;
    c.balanceType = 'none';
    c.oldBalanceDate = '';
    saveData();

    // إعادة تحديث تنبيه المديونية في نفس شاشة الفاتورة فوراً
    window.handleCustomerSelectChange();
};

// إقفال سريع للحساب السابق (المستقل) لعميل مباشرة من داخل شاشة الفاتورة، بدون الحاجة للذهاب لشاشة تعديل العميل
window.closeCustomerOldBalanceFromInvoice = function(customerName) {
    let c = customers.find(cc => cc.name === customerName);
    if(!c) return;
    if(!confirm(`هل تريد إقفال "الحساب السابق" المستقل لهذا العميل (${customerName})؟\n\nملحوظة: هذا يصفّر فقط الرصيد السابق اليدوي، ولا يؤثر على أي فواتير غير مسددة له فعلياً - لو باقي عليه متبقي من فواتير سابقة هيفضل ظاهر.`)) return;

    c.oldBalance = 0;
    c.balanceType = 'none';
    c.oldBalanceDate = '';
    saveData();

    // نعيد رسم صندوق تنبيه المديونية في الفاتورة عشان يعكس الرصيد الجديد فوراً
    window.handleCustomerSelectChange();
};

window.saveEditedCustomer = function(e) {
    e.preventDefault();
    let index = document.getElementById('editCustIndex').value;
    let c = customers[index];
    if(!c) return;

    let newName = document.getElementById('editCustName').value.trim();
    let oldName = c.name;

    c.name = newName;
    c.phone = document.getElementById('editCustPhone').value.trim();
    c.address = document.getElementById('editCustAddress').value.trim();
    c.oldBalance = Number(document.getElementById('editCustOldBalance').value) || 0;
    c.balanceType = document.getElementById('editCustBalanceType').value;
    c.oldBalanceDate = document.getElementById('editCustOldBalanceDate').value.trim();

    // لو اتغير اسم العميل، نحدّث كل الفواتير المرتبطة بيه عشان يفضل الربط سليم
    if(oldName !== newName) {
        invoices.forEach(inv => {
            if(inv.customerName === oldName) inv.customerName = newName;
        });
        machineEntries.forEach(e => { if(e.customerName === oldName) e.customerName = newName; });
        machinePayments.forEach(p => { if(p.customerName === oldName) p.customerName = newName; });
    }

    saveData();
    refreshAllData();
    closeEditCustomerModal();
    alert('تم تحديث بيانات العميل بنجاح!');
};

window.deleteCustomer = function(index) {
    let c = customers[index];
    if(!c) return;
    let hasInvoices = invoices.some(i => i.customerName === c.name);
    let msg = hasInvoices
        ? `تنبيه: هذا العميل لديه فواتير مسجلة! سيتم حذفه من الدليل فقط دون حذف الفواتير. هل تريد المتابعة؟`
        : `هل أنت متأكد من حذف هذا العميل من الدليل؟`;
    if(confirm(msg)) {
        customers.splice(index, 1);
        saveData();
        refreshAllData();
    }
};

// ===================== معاينة وطباعة الفاتورة =====================
window.showInvoiceModalEncoded = function(encodedInv) {
    window.showInvoiceModal(JSON.parse(decodeURIComponent(encodedInv)));
};

window.showInvoiceModal = function(inv) {
    currentInvoiceData = inv;
    currentInvoiceIndex = invoices.findIndex(i => i.id === inv.id);
    window.activePrintingInvoice = inv;

    let area = document.getElementById('printableInvoiceArea');
    if(!area) return;

    let itemsHtml = '';
    if(inv.items) {
        inv.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;"><bdi style="unicode-bidi: isolate; direction: auto;">${item.name}</bdi></td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${item.qty}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${item.price.toLocaleString()} ج.م</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">${item.total.toLocaleString()} ج.م</td>
                </tr>
            `;
        });
    }

    let oldBalPrintHtml = '';
    if(inv.oldBalance && inv.oldBalance > 0) {
        let label = inv.oldBalanceType === 'on_him' ? 'حساب سابق (عليه)' : 'حساب سابق (له)';
        let color = inv.oldBalanceType === 'on_him' ? '#e11d48' : '#0284c7';
        let sign = inv.oldBalanceType === 'on_him' ? '+' : '-';
        oldBalPrintHtml = `<p style="margin: 3px 0; color:${color};">${label}: ${sign}${inv.oldBalance.toLocaleString()} ج.م</p>`;
    }

    let discountPrintHtml = '';
    if(inv.discountPercent && inv.discountPercent > 0) {
        discountPrintHtml = `<p style="margin: 3px 0; color: #10b981;">خصم (${inv.discountPercent}%): -${(inv.discountAmount || 0).toLocaleString()} ج.م</p>`;
    }

    let remainingVal = Number(inv.remaining || 0);
    let remainingLineHtml = remainingVal > 0.5
        ? `<p style="margin: 4px 0; color: #e11d48; font-weight: bold;">المتبقي عليه: ${remainingVal.toLocaleString()} ج.م</p>`
        : (remainingVal < -0.5
            ? `<p style="margin: 4px 0; color: #059669; font-weight: bold;">له رصيد زيادة: ${Math.abs(remainingVal).toLocaleString()} ج.م</p>`
            : `<p style="margin: 4px 0; color: #059669; font-weight: bold;">تم السداد بالكامل</p>`);

    area.innerHTML = `
        <div style="background: #fff; color: #000; padding: 20px; font-family: Tahoma, sans-serif; direction: rtl; text-align: right; width: 100%; box-sizing: border-box;">
            
            <div style="text-align: center; margin-bottom: 10px;">
                <h1 style="margin: 0 0 5px 0; color: #0284c7; font-size: 24px; font-weight: bold;">${settings.companyName || 'Bro Tech'}</h1>
                <p style="margin: 2px 0; font-size: 13px; color: #475569;">لصيانه و بيع جميع انواع مكن الطباعه</p>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; font-size: 13px;">
                <div>
                    <p style="margin: 2px 0;"><strong>العنوان:</strong> ${settings.address || ''}</p>
                    <p style="margin: 2px 0;"><strong>الهاتف:</strong> ${settings.whatsapp || ''}</p>
                </div>
                <div style="text-align: left;">
                    <p style="margin: 2px 0;"><strong>التاريخ:</strong> ${inv.date}</p>
                </div>
            </div>

            <hr style="border: none; border-top: 2px solid #0284c7; margin: 10px 0;">

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; margin-bottom: 15px; font-size: 13px; border-radius: 4px;">
                <strong>العميل:</strong> ${inv.customerName} &nbsp;|&nbsp; <strong>الهاتف:</strong> ${inv.customerPhone || '---'} &nbsp;|&nbsp; <strong>العنوان:</strong> ${inv.customerAddress || '---'}
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
                <thead>
                    <tr style="background: #f1f5f9; color: #1e293b;">
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">الصنف</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">الكمية</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">السعر</th>
                        <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <div style="font-size: 13px; border-top: 2px solid #cbd5e1; padding-top: 10px; text-align: left; width: 300px; margin-right: auto;">
                <p style="margin: 4px 0;">إجمالي المشتريات: ${(inv.subtotal || inv.total).toLocaleString()} ج.م</p>
                ${discountPrintHtml}
                ${oldBalPrintHtml}
                <p style="margin: 6px 0; font-size: 15px; font-weight: bold; color: #0284c7;">الإجمالي النهائي: ${inv.total.toLocaleString()} ج.م</p>
                <p style="margin: 4px 0;">المدفوع: ${(inv.paid || 0).toLocaleString()} ج.م</p>
                ${remainingLineHtml}
            </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 15px; padding: 10px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
            <button onclick="printInvoice()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fas fa-print"></i> طباعة الفاتورة</button>
            <button onclick="sendToWhatsAppNabawy()" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fab fa-whatsapp"></i> إرسال لمحمد النبوي</button>
            <button onclick="closeInvoiceModal()" style="background: #64748b; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fas fa-times"></i> إغلاق</button>
        </div>
    `;
    document.getElementById('invoiceModal').style.display = 'flex';
};

window.closeInvoiceModal = function() { document.getElementById('invoiceModal').style.display = 'none'; };

window.sendToWhatsAppNabawy = function() {
    let targetInv = window.activePrintingInvoice || currentInvoiceData;
    if(!targetInv) return;
    let msg = `*${settings.companyName}*\n` +
              `📄 *فاتورة رقم:* ${targetInv.id}\n` +
              `👤 *العميل:* ${targetInv.customerName}\n` +
              `💰 *الإجمالي النهائي:* ${targetInv.total.toLocaleString()} ج.م\n` +
              `📌 *المتبقي:* ${(targetInv.remaining || 0).toLocaleString()} ج.م`;
    let phone = (settings.whatsappNabawy || '01092201111').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.sendToWhatsApp = function() {
    window.sendToWhatsAppNabawy();
};

window.downloadPDF = function() {
    let area = document.getElementById('printableInvoiceArea');
    if(!area || typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        window.printInvoice();
        return;
    }
    html2canvas(area).then(canvas => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        let inv = window.activePrintingInvoice || currentInvoiceData;
        pdf.save(`فاتورة-${inv ? inv.id : 'protech'}.pdf`);
    });
};

function initChart() {
    const ctx = document.getElementById('salesPurchasesChart');
    if(!ctx || typeof Chart === 'undefined') return;
    mainChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
            datasets: [
                { label: 'المبيعات', data: [12000, 19000, 15000, 25000, 32000, 41000, 48000, 0, 0, 0, 0, 0], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', tension: 0.3, fill: true },
                { label: 'المشتريات', data: [10000, 15000, 12000, 20000, 28000, 35000, 40000, 0, 0, 0, 0, 0], borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)', tension: 0.3, fill: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

document.addEventListener('gesturestart', function(e) { e.preventDefault(); });

window.printInvoice = function() {
    let inv = window.activePrintingInvoice || currentInvoiceData;
    if(!inv) {
        alert('لا توجد فاتورة محددة للطباعة!');
        return;
    }

    let itemsHtml = '';
    if(inv.items) {
        inv.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;"><bdi style="unicode-bidi: isolate; direction: auto;">${item.name}</bdi></td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${item.qty}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${item.price.toLocaleString()} ج.م</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">${item.total.toLocaleString()} ج.م</td>
                </tr>
            `;
        });
    }

    let oldBalPrintHtml = '';
    if(inv.oldBalance && inv.oldBalance > 0) {
        let label = inv.oldBalanceType === 'on_him' ? 'حساب سابق (عليه)' : 'حساب سابق (له)';
        let color = inv.oldBalanceType === 'on_him' ? '#e11d48' : '#0284c7';
        let sign = inv.oldBalanceType === 'on_him' ? '+' : '-';
        oldBalPrintHtml = `<p style="margin: 3px 0; color:${color};">${label}: ${sign}${inv.oldBalance.toLocaleString()} ج.م</p>`;
    }

    let discountPrintHtml = '';
    if(inv.discountPercent && inv.discountPercent > 0) {
        discountPrintHtml = `<p style="margin: 3px 0; color: #10b981;">خصم (${inv.discountPercent}%): -${(inv.discountAmount || 0).toLocaleString()} ج.م</p>`;
    }

    let remainingValPrint = Number(inv.remaining || 0);
    let remainingLinePrintHtml = remainingValPrint > 0.5
        ? `<p style="margin: 4px 0; color: #e11d48; font-weight: bold;">المتبقي عليه: ${remainingValPrint.toLocaleString()} ج.م</p>`
        : (remainingValPrint < -0.5
            ? `<p style="margin: 4px 0; color: #059669; font-weight: bold;">له رصيد زيادة: ${Math.abs(remainingValPrint).toLocaleString()} ج.م</p>`
            : `<p style="margin: 4px 0; color: #059669; font-weight: bold;">تم السداد بالكامل</p>`);

    let printWindow = window.open('', '_blank', 'height=900,width=1000');

    printWindow.document.write(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>فاتورة مبيعات - Bro Tech</title>
            <style>
                body {
                    font-family: Tahoma, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background: #ffffff;
                    color: #000000;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    border: 1px solid #cbd5e1 !important;
                }
                @page {
                    size: A4;
                    margin: 10mm;
                }
            </style>
        </head>
        <body>
            <div style="width: 100%; max-width: 800px; margin: 0 auto; background: #fff; padding: 20px; box-sizing: border-box;">
                
                <div style="text-align: center; margin-bottom: 10px;">
                    <h1 style="margin: 0 0 5px 0; color: #0284c7; font-size: 24px; font-weight: bold;">${settings.companyName || 'Bro Tech'}</h1>
                    <p style="margin: 2px 0; font-size: 13px; color: #475569;">لصيانه و بيع جميع انواع مكن الطباعه</p>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; font-size: 13px;">
                    <div>
                        <p style="margin: 2px 0;"><strong>العنوان:</strong> ${settings.address || ''}</p>
                        <p style="margin: 2px 0;"><strong>الهاتف:</strong> ${settings.whatsapp || ''}</p>
                    </div>
                    <div style="text-align: left;">
                        <p style="margin: 2px 0;"><strong>التاريخ:</strong> ${inv.date}</p>
                    </div>
                </div>

                <hr style="border: none; border-top: 2px solid #0284c7; margin: 10px 0;">

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; margin-bottom: 15px; font-size: 13px; border-radius: 4px;">
                    <strong>العميل:</strong> ${inv.customerName} &nbsp;|&nbsp; <strong>الهاتف:</strong> ${inv.customerPhone || '---'} &nbsp;|&nbsp; <strong>العنوان:</strong> ${inv.customerAddress || '---'}
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
                    <thead>
                        <tr style="background: #f1f5f9; color: #1e293b;">
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">الصنف</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">الكمية</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">السعر</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <div style="font-size: 13px; border-top: 2px solid #cbd5e1; padding-top: 10px; text-align: left; width: 300px; margin-right: auto;">
                    <p style="margin: 4px 0;">إجمالي المشتريات: ${(inv.subtotal || inv.total).toLocaleString()} ج.م</p>
                    ${discountPrintHtml}
                    ${oldBalPrintHtml}
                    <p style="margin: 6px 0; font-size: 15px; font-weight: bold; color: #0284c7;">الإجمالي النهائي: ${inv.total.toLocaleString()} ج.م</p>
                    <p style="margin: 4px 0;">المدفوع: ${(inv.paid || 0).toLocaleString()} ج.م</p>
                    ${remainingLinePrintHtml}
                </div>
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        window.close();
                    }, 300);
                }
            </script>
        </body>
        </html>
    `);

    printWindow.document.close();
};

// ===================== تقارير المبيعات =====================
window.toggleReportMenu = function() {
    let menu = document.getElementById('reportMenuDropdown');
    if(menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
};

window.addEventListener('click', function(e) {
    if (!e.target.closest('#reportMenuDropdown') && !e.target.closest('button[onclick="toggleReportMenu()"]')) {
        let menu = document.getElementById('reportMenuDropdown');
        if(menu) menu.style.display = 'none';
    }
});

window.openCustomReport = function(type) {
    let menu = document.getElementById('reportMenuDropdown');
    if(menu) menu.style.display = 'none';

    let now = new Date();
    let filteredInvoices = [];
    let reportTitle = '';

    if (type === 'daily') {
        let todayStr = now.toLocaleDateString('ar-EG');
        filteredInvoices = invoices.filter(inv => inv.date === todayStr);
        reportTitle = `تقرير المبيعات اليومية (${todayStr})`;
    }
    else if (type === 'weekly') {
        filteredInvoices = invoices.slice(-30);
        reportTitle = `تقرير المبيعات الأسبوعي (آخر الفواتير)`;
    }
    else if (type === 'monthly') {
        let currentYear = now.getFullYear();
        filteredInvoices = invoices.filter(inv => inv.date && inv.date.includes(currentYear.toString()));
        reportTitle = `تقرير المبيعات الشهري (${currentYear})`;
    }

    let totalSales = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    let totalPaid = filteredInvoices.reduce((sum, inv) => sum + Number(inv.paid || 0), 0);
    let totalRemaining = filteredInvoices.reduce((sum, inv) => sum + Number(inv.remaining || 0), 0);

    let rowsHtml = '';
    if(filteredInvoices.length === 0) {
        rowsHtml = `<tr><td colspan="5" style="text-align: center; padding: 15px; color: #64748b;">لا توجد فواتير مسجلة لهذه الفترة</td></tr>`;
    } else {
        filteredInvoices.forEach(inv => {
            rowsHtml += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${inv.id}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${inv.date}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${inv.customerName}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${inv.total.toLocaleString()} ج.م</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; color: #e11d48;">${(inv.remaining || 0).toLocaleString()} ج.م</td>
                </tr>
            `;
        });
    }

    let reportWin = window.open('', '_blank', 'height=700,width=900');
    reportWin.document.write(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>${reportTitle} - Bro Tech</title>
            <style>
                body { font-family: Tahoma, sans-serif; padding: 20px; background: #fff; color: #000; direction: rtl; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; }
                th { background: #f1f5f9; }
                .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-around; font-weight: bold; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #0284c7; margin: 0;">Bro Tech - ${reportTitle}</h2>
            </div>

            <div class="summary-box">
                <div>إجمالي المبيعات: <span style="color: #0284c7;">${totalSales.toLocaleString()} ج.م</span></div>
                <div>التحصيل النقدي: <span style="color: #10b981;">${totalPaid.toLocaleString()} ج.م</span></div>
                <div>الآجل المتبقي: <span style="color: #e11d48;">${totalRemaining.toLocaleString()} ج.م</span></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>رقم الفاتورة</th>
                        <th>التاريخ</th>
                        <th>اسم العميل</th>
                        <th>إجمالي الفاتورة</th>
                        <th>المتبقي</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>

            <div class="no-print" style="margin-top: 25px; text-align: center;">
                <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">🖨️ طباعة التقرير / حفظ PDF</button>
            </div>
        </body>
        </html>
    `);
    reportWin.document.close();
};

// (كشف الحساب الجديد موجود في قسم v3 بآخر الملف)

// ===================== تعديل سداد الفواتير المباشر من الجدول =====================
window.openInvoicePaymentByIndex = function(index) {
    if (typeof invoices === 'undefined' || !invoices[index]) {
        alert('خطأ في بيانات الفاتورة!');
        return;
    }

    let inv = invoices[index];
    window.currentEditingInvoiceIndex = index;

    document.getElementById('editPaymentInvIndex').value = index;
    let invNumEl = document.getElementById('editPaymentInvNumber');
    if(invNumEl) invNumEl.innerText = inv.id;

    let custNameEl = document.getElementById('editPaymentCustomerName');
    if(custNameEl) custNameEl.innerText = inv.customerName;

    let remEl = document.getElementById('editPaymentCurrentRemaining');
    if(remEl) remEl.innerText = (inv.remaining || 0).toLocaleString() + ' ج.م';

    let payInput = document.getElementById('payAmountInput');
    if(payInput) payInput.value = inv.remaining || 0;

    let today = new Date().toLocaleDateString('ar-EG');
    let noteInput = document.getElementById('payNoteInput');
    if(noteInput) noteInput.value = `تم سداد دفعة بتاريخ ${today}`;

    let modal = document.getElementById('editInvoicePaymentModal');
    if(modal) modal.style.display = 'flex';
};

window.editInvoiceStatusModal = function() {
    if (currentInvoiceIndex === null || currentInvoiceIndex === undefined || currentInvoiceIndex < 0) {
        alert('برجاء اختيار فاتورة أولاً!');
        return;
    }
    window.openInvoicePaymentByIndex(currentInvoiceIndex);
};

window.closeEditPaymentModal = function() {
    let modal = document.getElementById('editInvoicePaymentModal');
    if(modal) modal.style.display = 'none';
};

window.submitInvoicePaymentUpdate = function() {
    let index = document.getElementById('editPaymentInvIndex').value;
    let payAmount = parseFloat(document.getElementById('payAmountInput').value) || 0;
    let payNote = document.getElementById('payNoteInput').value.trim();

    if (index === "" || payAmount <= 0) {
        alert('برجاء أدخال مبلغ سداد صحيح!');
        return;
    }

    let inv = invoices[index];
    let currentRemaining = inv.remaining || 0;

    if (payAmount > currentRemaining) {
        if (!confirm('المبلغ المدفوع أكبر من المتبقي على الفاتورة، هل تريد الاستمرار؟')) {
            return;
        }
    }

    // تحديث الفاتورة: المدفوع يزيد والمتبقي (الدين) يقل تلقائياً، وينعكس فوراً على دليل العملاء
    inv.paid = Number(inv.paid || 0) + payAmount;
    inv.remaining = Math.max(0, currentRemaining - payAmount);
    if (inv.remaining === 0) {
        inv.status = 'تم الدفع بالكامل';
    } else {
        inv.status = `متبقي: ${inv.remaining} ج.م`;
    }

    if (!inv.paymentHistory) inv.paymentHistory = [];
    let payMoment = new Date();
    inv.paymentHistory.push({
        amount: payAmount,
        date: payMoment.toLocaleString('ar-EG'),
        dateISO: payMoment.toISOString(), // يُستخدم لحساب عدد أيام التأخير بدقة
        note: payNote
    });

    saveData();
    refreshAllData();

    closeEditPaymentModal();
    closeInvoiceModal();

    alert(`تم تسجيل سداد مبلغ ${payAmount.toLocaleString()} ج.م بنجاح، وتم تحديث مديونية العميل تلقائياً في دليل العملاء!`);
};

// ===================== بحث سريع عام =====================
window.handleGlobalSearch = function(event) {
    let query = event.target.value.toLowerCase().trim();
    if(!query) return;
    // بحث في العملاء أولاً، ولو موجود ننقل المستخدم لصفحة العملاء ونطبق الفلتر
    let foundCustomer = customers.find(c => c.name.toLowerCase().includes(query) || (c.phone || '').includes(query));
    let foundInvoice = invoices.find(i => i.id.toLowerCase().includes(query) || i.customerName.toLowerCase().includes(query));
    let foundProduct = inventory.find(i => i.name.toLowerCase().includes(query) || i.code.toLowerCase().includes(query));

    if(event.key === 'Enter') {
        if(foundCustomer) {
            window.switchTab('customers');
            document.getElementById('searchCustomers').value = query;
            window.filterCustomers();
        } else if(foundInvoice) {
            window.switchTab('sales');
            document.getElementById('searchInvoices').value = query;
            window.filterInvoices();
        } else if(foundProduct) {
            window.switchTab('inventory');
            document.getElementById('searchInventory').value = query;
            window.filterInventory();
        }
    }
};

window.saveSettings = function(event) {
    event.preventDefault();
    settings.companyName = document.getElementById('companyNameInput').value.trim();
    settings.owner = document.getElementById('companyOwnerInput').value.trim();
    settings.whatsapp = document.getElementById('whatsappNumberInput').value.trim();
    settings.address = document.getElementById('companyAddressInput').value.trim();
    saveData();
    alert('تم حفظ إعدادات النظام بنجاح!');
};

// تغيير كلمة مرور دخول النظام (تُستخدم في login.html)
window.changeSystemPassword = function(event) {
    event.preventDefault();
    let current = document.getElementById('currentPasswordInput').value;
    let newPass = document.getElementById('newPasswordInput').value;
    let confirmPass = document.getElementById('confirmPasswordInput').value;
    let savedPassword = settings.password || 'protech2026';

    if(current !== savedPassword) {
        alert('كلمة المرور الحالية غير صحيحة!');
        return;
    }
    if(!newPass || newPass.length < 4) {
        alert('كلمة المرور الجديدة يجب ألا تقل عن 4 حروف/أرقام!');
        return;
    }
    if(newPass !== confirmPass) {
        alert('كلمة المرور الجديدة وتأكيدها غير متطابقين!');
        return;
    }

    settings.password = newPass;
    saveData();
    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
    alert('تم تغيير كلمة المرور بنجاح! استخدمها في المرة القادمة لتسجيل الدخول.');
};

// ===================== كشف المصروفات (عام للشركة + لكل موظف) =====================

// تعبئة قوائم الفلترة/الإضافة (تتغير حسب قائمة الموظفين الحالية) ثم عرض الجدول
function renderExpensesTab() {
    let filterSelect = document.getElementById('expenseFilterSelect');
    let expenseEmpSelect = document.getElementById('expenseEmployeeSelect');
    if(!filterSelect && !expenseEmpSelect) return; // مش موجودين في الصفحة دي (مثلاً صفحة موظف)

    let currentFilterVal = filterSelect ? filterSelect.value : 'ALL_COMPANY';
    let empList = (typeof employees !== 'undefined' && employees) ? employees : [];

    if(filterSelect) {
        let optsHtml = '<option value="ALL_COMPANY">كل مصروفات الشركة (عام + كل الموظفين)</option><option value="COMPANY_ONLY">مصروفات عامة للشركة فقط</option>';
        empList.forEach(emp => { optsHtml += `<option value="EMP_${emp.id}">${emp.name}</option>`; });
        filterSelect.innerHTML = optsHtml;
        if(Array.from(filterSelect.options).some(o => o.value === currentFilterVal)) filterSelect.value = currentFilterVal;
    }
    if(expenseEmpSelect) {
        let optsHtml2 = '<option value="">-- اختر الموظف --</option>';
        empList.forEach(emp => { optsHtml2 += `<option value="${emp.id}">${emp.name}</option>`; });
        expenseEmpSelect.innerHTML = optsHtml2;
    }

    renderExpensesTable();
}

// عرض/تصفية جدول المصروفات + إجمالي الكشف الحالي (بدون إعادة بناء القوائم عشان يفضل اختيار المستخدم زي ما هو)
window.renderExpensesTable = function() {
    let tbody = document.getElementById('expensesTableBody');
    let totalEl = document.getElementById('expensesTotalDisplay');
    let filterSelect = document.getElementById('expenseFilterSelect');
    if(!tbody) return;

    let filterVal = filterSelect ? filterSelect.value : 'ALL_COMPANY';
    let list = (companyExpenses || []).slice();

    if(filterVal === 'COMPANY_ONLY') {
        list = list.filter(e => !e.employeeId);
    } else if(filterVal && filterVal.indexOf('EMP_') === 0) {
        let empId = filterVal.replace('EMP_', '');
        list = list.filter(e => String(e.employeeId) === String(empId));
    }

    list.sort((a, b) => new Date(b.dateISO || b.date) - new Date(a.dateISO || a.date));

    tbody.innerHTML = '';
    let total = 0;
    if(list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">لا توجد أي مصروفات مسجلة ضمن هذا الكشف</td></tr>`;
    } else {
        list.forEach(exp => {
            total += Number(exp.amount || 0);
            let targetLabel = exp.employeeName
                ? `${exp.target} <span style="color:#94a3b8; font-size:11px;">(${exp.employeeName})</span>`
                : exp.target;
            tbody.innerHTML += `
                <tr>
                    <td>${exp.date}</td>
                    <td style="font-weight:bold; color:#e11d48;">${Number(exp.amount).toLocaleString()} ج.م</td>
                    <td>${targetLabel}</td>
                    <td>${exp.notes || '-'}</td>
                    <td style="text-align:center;"><button onclick="deleteExpenseEntry('${exp.id}')" style="background:#fee2e2; color:#991b1b; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;"><i class="fas fa-trash"></i></button></td>
                </tr>
            `;
        });
    }
    if(totalEl) totalEl.innerText = total.toLocaleString() + ' ج.م';
};

window.toggleExpenseEmployeeSelect = function() {
    let typeSelect = document.getElementById('expenseTypeSelect');
    let wrap = document.getElementById('expenseEmployeeSelectWrap');
    if(wrap) wrap.style.display = (typeSelect && typeSelect.value === 'EMPLOYEE') ? 'block' : 'none';
};

window.addExpenseEntry = function(event) {
    event.preventDefault();
    let dateInput = document.getElementById('expenseDateInput');
    let amount = Number(document.getElementById('expenseAmountInput').value);
    let target = document.getElementById('expenseTargetInput').value.trim();
    let notes = document.getElementById('expenseNotesInput').value.trim();
    let typeSelect = document.getElementById('expenseTypeSelect');
    let empSelect = document.getElementById('expenseEmployeeSelect');

    if(!amount || amount <= 0 || !target) {
        alert('من فضلك أدخل المبلغ والجهة على الأقل!');
        return;
    }

    let employeeId = null, employeeName = null;
    if(typeSelect && typeSelect.value === 'EMPLOYEE') {
        if(!empSelect || !empSelect.value) {
            alert('من فضلك اختر الموظف!');
            return;
        }
        employeeId = empSelect.value;
        let emp = (employees || []).find(e => String(e.id) === String(employeeId));
        employeeName = emp ? emp.name : '';
    }

    let dateVal = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().split('T')[0];
    let dateObj = new Date(dateVal);
    let displayDate = dateObj.toLocaleDateString('ar-EG');

    companyExpenses.push({
        id: 'EXP-' + Date.now(),
        date: displayDate,
        dateISO: dateObj.toISOString(),
        amount, target, notes,
        employeeId, employeeName
    });

    saveData();
    refreshAllData();

    document.getElementById('expenseAmountInput').value = '';
    document.getElementById('expenseTargetInput').value = '';
    document.getElementById('expenseNotesInput').value = '';
};

window.deleteExpenseEntry = function(id) {
    if(!confirm('هل أنت متأكد من حذف هذه الحركة من كشف المصروفات؟')) return;
    companyExpenses = companyExpenses.filter(e => e.id !== id);
    saveData();
    refreshAllData();
};

// طباعة كشف المصروفات بنفس شكل النموذج الرسمي بالظبط - لو مفيش بيانات، بيطبع فورم فاضي بنفس عدد الصفوف
window.printExpensesSheet = function() {
    let filterSelect = document.getElementById('expenseFilterSelect');
    let filterVal = filterSelect ? filterSelect.value : 'ALL_COMPANY';
    let list = (companyExpenses || []).slice();
    let titleSuffix = '';

    if(filterVal === 'COMPANY_ONLY') {
        list = list.filter(e => !e.employeeId);
        titleSuffix = ' - مصروفات عامة';
    } else if(filterVal && filterVal.indexOf('EMP_') === 0) {
        let empId = filterVal.replace('EMP_', '');
        list = list.filter(e => String(e.employeeId) === String(empId));
        let emp = (employees || []).find(e => String(e.id) === String(empId));
        titleSuffix = emp ? ` - ${emp.name}` : '';
    }

    list.sort((a, b) => new Date(a.dateISO || a.date) - new Date(b.dateISO || b.date));
    let total = list.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const TOTAL_ROWS = 22;
    let rowsHtml = '';
    let rowCount = Math.max(list.length, TOTAL_ROWS);
    for(let i = 0; i < rowCount; i++) {
        let exp = list[i];
        if(exp) {
            rowsHtml += `
                <tr>
                    <td style="padding:6px 8px; border:1px solid #333; text-align:center;">${exp.date}</td>
                    <td style="padding:6px 8px; border:1px solid #333; text-align:center;">${Number(exp.amount).toLocaleString()}</td>
                    <td style="padding:6px 8px; border:1px solid #333;">${exp.target}${exp.employeeName ? ' (' + exp.employeeName + ')' : ''}</td>
                    <td style="padding:6px 8px; border:1px solid #333;">${exp.notes || ''}</td>
                </tr>
            `;
        } else {
            rowsHtml += `
                <tr>
                    <td style="padding:6px 8px; border:1px solid #333; height:26px;">&nbsp;</td>
                    <td style="padding:6px 8px; border:1px solid #333;">&nbsp;</td>
                    <td style="padding:6px 8px; border:1px solid #333;">&nbsp;</td>
                    <td style="padding:6px 8px; border:1px solid #333;">&nbsp;</td>
                </tr>
            `;
        }
    }

    let printWin = window.open('', '_blank', 'height=1000,width=850');
    printWin.document.write(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>كشف مصروفات${titleSuffix}</title>
            <style>
                body { font-family: Tahoma, Arial, sans-serif; padding: 25px; color:#000; direction: rtl; }
                h1 { text-align:center; font-size: 22px; margin-bottom: 18px; }
                table { width: 100%; border-collapse: collapse; }
                th { background:#f1f1f1; border:1px solid #333; padding:8px; font-size:13px; }
                td { font-size: 12.5px; }
                tfoot td { font-weight:bold; background:#f1f1f1; border:1px solid #333; padding:8px; }
                .footer-tagline { text-align:center; font-size:11px; color:#444; margin-top:14px; }
                @media print { @page { size: A4; margin: 12mm; } }
            </style>
        </head>
        <body>
            <h1>كشف مصروفات${titleSuffix}</h1>
            <table>
                <thead>
                    <tr>
                        <th style="width:15%;">التاريخ</th>
                        <th style="width:15%;">المبلغ</th>
                        <th style="width:35%;">الجهة</th>
                        <th style="width:35%;">الملاحظات</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr>
                        <td style="text-align:center;">الإجمالي</td>
                        <td style="text-align:center;">${total.toFixed(2)}</td>
                        <td colspan="2">&nbsp;</td>
                    </tr>
                </tfoot>
            </table>
            <p class="footer-tagline">${(settings.companyName || 'شركة برو تيك')} لصيانة وبيع جميع أنواع ماكينات الطباعة</p>
            <script>window.onload = function(){ window.print(); };<\/script>
        </body>
        </html>
    `);
    printWin.document.close();
};

/* =====================================================================
   ProTech v3 — إضافات جديدة
   1) كشف حساب تفصيلي (دفع ساعتها كام من كام + السداد اللاحق) مع فلترة وواتساب
   2) سداد مديونية العميل (سريع FIFO / يدوي) مع إيصال
   3) أعمار الديون وتنبيه المتأخرين
   4) حساب المكن (منفصل عن الفواتير) بدفعات ومتبقي
   5) نسخ احتياطي JSON / Excel + استرجاع
   6) نموذج فاتورة جديد مبسط وفاتح + إضافة صنف جديد من داخل الفاتورة
   ===================================================================== */

// ---------- أدوات مساعدة ----------
const fmt = n => Number(n || 0).toLocaleString();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = s => encodeURIComponent(s).replace(/'/g, '%27');
const dec = s => decodeURIComponent(s);
const sumOf = (arr, fn) => arr.reduce((t, x) => t + Number(fn(x) || 0), 0);

function toLatinDigits(s) {
    return String(s || '')
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}
// تاريخ أي سجل (فاتورة / دفعة): نفضل dateISO، وإلا نحلل النص العربي dd/mm/yyyy
function recDate(rec) {
    if (!rec) return null;
    if (rec.dateISO) { let d = new Date(rec.dateISO); if (!isNaN(d.getTime())) return d; }
    let m = toLatinDigits(rec.date).match(/(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})/);
    if (m) {
        let a = +m[1], b = +m[2], c = +m[3];
        let d = a > 31 ? new Date(a, b - 1, c) : new Date(c, b - 1, a);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}
function ageDaysOf(rec) {
    let d = recDate(rec);
    if (!d) return null;
    let t = new Date(); t.setHours(0, 0, 0, 0);
    let s = new Date(d); s.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((t - s) / 86400000));
}
function signedOldOf(inv) {
    let o = Number(inv.oldBalance || 0);
    return inv.oldBalanceType === 'on_him' ? o : (inv.oldBalanceType === 'for_him' ? -o : 0);
}
function gotoTab(id) {
    let li = document.querySelector(`.nav-links li[onclick*="'${id}'"]`);
    window.switchTab(id, li);
}

// تفصيل الفاتورة: دفع ساعتها كام، سداد لاحق كام، مُرحّل كام
// initial = المدفوع وقت الإنشاء. لو الفاتورة جديدة بيتخزن في initialPaid، ولو قديمة بنستنتجه (المدفوع - الدفعات اللاحقة)
function invBreakdown(inv) {
    let hist = inv.paymentHistory || [];
    let carriedList = hist.filter(p => p.type === 'carried');
    let laterList = hist.filter(p => p.type !== 'carried');
    let laterSum = sumOf(laterList, p => p.amount);
    let carried = sumOf(carriedList, p => p.amount);
    let paid = Number(inv.paid || 0);
    let initial = inv.initialPaid != null ? Number(inv.initialPaid) : Math.max(0, paid - laterSum - carried);
    let legacySettled = !carriedList.length && /تسوية رصيد/.test(inv.status || '');
    return {
        total: Number(inv.total || 0), paid, initial, laterList, laterSum,
        carriedList, carried, remaining: Number(inv.remaining || 0), legacySettled
    };
}

// ---------- بيانات العميل ----------
function unpaidOf(name) {
    return invoices.map((inv, idx) => ({ inv, idx }))
        .filter(x => x.inv.customerName === name && Number(x.inv.remaining || 0) > 0.5)
        .sort((a, b) => {
            let da = recDate(a.inv), db = recDate(b.inv);
            if (da && db && da - db !== 0) return da - db;
            return a.idx - b.idx;
        });
}
function custOldDebt(c) { return (c && c.balanceType === 'on_him' && Number(c.oldBalance) > 0) ? Number(c.oldBalance) : 0; }
function machineTotals(name) {
    let entries = machineEntries.filter(x => x.customerName === name);
    let payments = machinePayments.filter(x => x.customerName === name);
    let total = sumOf(entries, e => e.total), paid = sumOf(payments, p => p.amount);
    return { entries, payments, total, paid, remaining: total - paid };
}
function oldestAge(name) {
    let max = null;
    unpaidOf(name).forEach(({ inv }) => { let a = ageDaysOf(inv); if (a !== null && (max === null || a > max)) max = a; });
    return max;
}
function bucketOf(days) { return days === null ? 0 : (days > 90 ? 3 : days > 60 ? 2 : days > 30 ? 1 : 0); }
const BUCKET_LABELS = ['0 – 30 يوم', '31 – 60 يوم', '61 – 90 يوم', 'أكثر من 90 يوم'];
const BUCKET_COLORS = ['#16a34a', '#d97706', '#ea580c', '#dc2626'];

function agingTotals() {
    let totals = [0, 0, 0, 0], counts = [0, 0, 0, 0];
    invoices.forEach(inv => {
        let r = Number(inv.remaining || 0);
        if (r > 0.5) { let b = bucketOf(ageDaysOf(inv)); totals[b] += r; counts[b]++; }
    });
    return { totals, counts };
}

// ---------- CSS (بيتحقن مرة واحدة، فيشتغل في لوحة الأدمن وصفحة الموظف) ----------
const RP_CSS = `
.rp-wrap{font-family:Tahoma,'Segoe UI',sans-serif;color:#1e293b;direction:rtl;text-align:right}
.rp-head{text-align:center;border-bottom:3px solid #0284c7;padding-bottom:12px;margin-bottom:14px}
.rp-head h1{margin:0;color:#0284c7;font-size:22px}
.rp-head p{margin:4px 0 0;font-size:12.5px;color:#64748b}
.rp-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}
.rp-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center}
.rp-card span{display:block;font-size:11.5px;color:#64748b;margin-bottom:3px}
.rp-card b{font-size:16px}
.rp-table{width:100%;border-collapse:collapse;margin-top:8px}
.rp-table th{background:#0f172a;color:#fff;font-size:12.5px;padding:8px;border:1px solid #0f172a}
.rp-table td{border:1px solid #cbd5e1;padding:8px;font-size:12.5px;vertical-align:top}
.rp-table td.c{text-align:center}
.rp-table tr.rp-sub td{background:#f8fafc;padding:6px 12px}
.rp-bar{height:6px;background:#e2e8f0;border-radius:4px;margin-top:5px;overflow:hidden}
.rp-bar i{display:block;height:100%;background:#10b981}
.rp-paidof{font-size:13px}
.rp-paidof b{color:#059669}
.rp-pay{font-size:12px;color:#166534;padding:2px 0}
.rp-pay.carried{color:#6d28d9}
.rp-after{display:inline-block;background:#e0f2fe;color:#075985;border-radius:10px;padding:0 8px;margin-right:6px;font-size:11.5px}
.rp-note{font-size:11.5px;color:#b45309;margin-top:4px}
.rp-b{display:inline-block;border-radius:12px;padding:2px 10px;font-size:11.5px;font-weight:700;margin-top:4px}
.rp-b-ok{background:#dcfce7;color:#166534}.rp-b-no{background:#fee2e2;color:#991b1b}
.rp-b-part{background:#fef3c7;color:#92400e}.rp-b-carry{background:#ede9fe;color:#5b21b6}
.rp-h2{font-size:15px;margin:20px 0 4px;color:#0f172a;border-right:4px solid #0284c7;padding-right:8px}
.rp-final{background:#0f172a;color:#fff;border-radius:10px;padding:14px;margin:18px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
.rp-final span{display:block;font-size:12px;color:#94a3b8}
.rp-final b{font-size:18px}
.rp-final .grand{background:#0284c7;border-radius:8px;padding:6px}
.rp-final .grand span{color:#e0f2fe}
.rp-sign{display:flex;justify-content:space-between;margin-top:40px;font-size:13px}
@media (max-width:700px){.rp-sum{grid-template-columns:repeat(2,1fr)}.rp-final{grid-template-columns:1fr}}
@media print{.no-print{display:none!important}body{padding:0!important}}
`;

const V3_CSS = RP_CSS + `
/* ---- عام ---- */
.v3-btn{border:none;border-radius:7px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;color:#fff;background:#0284c7;display:inline-flex;gap:6px;align-items:center}
.v3-btn.green{background:#10b981}.v3-btn.gray{background:#64748b}.v3-btn.red{background:#ef4444}.v3-btn.amber{background:#f59e0b}.v3-btn.wa{background:#25d366}
.v3-btn.sm{padding:5px 10px;font-size:12px}
.v3-btn:disabled{opacity:.5;cursor:not-allowed}
.v3-muted{color:#64748b;font-size:12px}
.v3-in{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13.5px;background:#fff;color:#0f172a;min-width:0}
.v3-in:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.18)}
/* ---- شريط أعمار الديون ---- */
.aging-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.aging-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;cursor:pointer;border-top-width:4px}
.aging-card:hover{box-shadow:0 4px 12px rgba(15,23,42,.08)}
.aging-card span{display:block;font-size:12px;color:#64748b}
.aging-card b{font-size:17px;color:#0f172a}
.aging-card small{color:#94a3b8;font-size:11.5px}
.aging-card.on{background:#f0f9ff}
#overdueAlert{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:none;align-items:center;gap:14px;flex-wrap:wrap}
#overdueAlert .txt{flex:1;min-width:220px;color:#9a3412;font-size:13.5px;line-height:1.8}
.cust-sub td{background:#f8fafc!important;padding:10px 16px!important}
.cust-inv{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:6px 0;border-bottom:1px dashed #e2e8f0;font-size:13px}
.cust-inv:last-child{border-bottom:none}
.cust-inv .grow{flex:1;min-width:200px}
.age-pill{display:inline-block;border-radius:10px;padding:1px 8px;font-size:11.5px;font-weight:700}
.toggle-unpaid{background:none;border:none;color:#0284c7;cursor:pointer;font-size:12px;font-weight:700;padding:2px 0}
/* ---- مودال كشف الحساب والسداد ---- */
.st-card{width:1000px!important;max-width:100%}
.st-filters{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;align-items:center}
.st-filters label{font-size:12.5px;color:#475569;display:flex;gap:5px;align-items:center}
.cp-card{width:720px!important;max-width:100%}
.cp-top{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.cp-top div{flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:9px 12px;font-size:12.5px;color:#64748b}
.cp-top b{display:block;font-size:18px;color:#0f172a}
.cp-modes{display:flex;gap:8px;margin-bottom:12px}
.cp-modes button{flex:1;padding:10px;border:2px solid #e2e8f0;background:#fff;border-radius:9px;cursor:pointer;font-weight:700;color:#475569;font-size:13px}
.cp-modes button.on{border-color:#0284c7;background:#e0f2fe;color:#075985}
.cp-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
.cp-table th{background:#f1f5f9;padding:7px;text-align:center;font-size:12px;color:#475569}
.cp-table td{padding:7px;border-bottom:1px solid #e2e8f0;text-align:center}
.cp-table input{width:100px;text-align:center}
.cp-sum{margin-top:12px;padding:10px 14px;border-radius:9px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-weight:700;font-size:13.5px}
.cp-sum.err{background:#fef2f2;border-color:#fecaca;color:#b91c1c}
/* ---- حساب المكن ---- */
.mc-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0}
.mc-cards div{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center}
.mc-cards span{display:block;font-size:12px;color:#64748b}.mc-cards b{font-size:19px}
.mc-form{display:grid;grid-template-columns:130px 130px 1fr 80px 110px auto;gap:8px;align-items:end;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px}
.mc-form.pay{grid-template-columns:130px 150px 1fr auto}
.mc-form label{display:block;font-size:11.5px;color:#64748b;margin-bottom:3px}
.mc-form .v3-in{width:100%}
.mc-pick{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 16px}
.mc-pick .v3-in{flex:1;min-width:220px}
@media (max-width:820px){.mc-form,.mc-form.pay{grid-template-columns:1fr 1fr}.mc-cards{grid-template-columns:1fr}.aging-strip{grid-template-columns:repeat(2,1fr)}}
/* ---- النسخ الاحتياطي ---- */
.bk-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-top:20px}
.bk-card h3{margin:0 0 6px;font-size:16px;color:#0f172a}
.bk-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
/* ---- نموذج الفاتورة الجديد (فاتح) ---- */
#newInvoiceModal .v3-inv{width:780px;max-width:100%;background:#fff;color:#0f172a;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;max-height:94vh}
.v3-inv-head{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
.v3-inv-head h3{margin:0;font-size:17px;color:#0f172a}
.v3-inv-head .close-btn{color:#64748b}
.v3-inv-body{padding:16px 20px;overflow-y:auto;flex:1}
.v3-inv-foot{padding:12px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;gap:10px}
.v3-inv-foot .save{flex:2;background:#10b981;color:#fff;border:none;border-radius:9px;padding:12px;font-weight:700;font-size:15px;cursor:pointer}
.v3-inv-foot .cancel{flex:1;background:#e2e8f0;color:#334155;border:none;border-radius:9px;padding:12px;cursor:pointer;font-weight:700}
.v3-sec{margin-bottom:16px}
.v3-lab{display:block;font-size:13px;font-weight:700;color:#334155;margin-bottom:6px}
.v3-sec-head{display:flex;justify-content:space-between;align-items:center}
.v3-link{background:none;border:none;color:#0284c7;font-weight:700;font-size:12.5px;cursor:pointer}
#newInvoiceModal select{width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a}
.v3-newcust{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;padding:10px;background:#f0f9ff;border:1px dashed #7dd3fc;border-radius:8px}
.v3-newcust input{width:100%}
.v3-info{padding:10px 12px;border-radius:8px;margin-top:8px;font-size:13px;line-height:1.8;font-weight:700}
.v3-incl{align-items:center;gap:10px;background:#f8fafc;padding:9px 12px;border-radius:8px;margin-top:8px;border:1px dashed #94a3b8}
.v3-search{position:relative}
.v3-search>i{position:absolute;right:12px;top:12px;color:#94a3b8;pointer-events:none}
.v3-search input{width:100%;padding:10px 36px 10px 10px;border:2px solid #bae6fd;border-radius:9px;font-size:14px;background:#fff;color:#0f172a}
.v3-search input:focus{outline:none;border-color:#0284c7}
.v3-results{display:none;position:absolute;z-index:90;top:100%;right:0;left:0;background:#fff;border:1px solid #cbd5e1;border-radius:9px;margin-top:3px;max-height:260px;overflow-y:auto;box-shadow:0 10px 25px rgba(15,23,42,.15)}
.v3-res{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13.5px}
.v3-res:hover,.v3-res.act{background:#f0f9ff}
.v3-res small{color:#64748b}
.v3-res .pr{font-weight:700;color:#0284c7;white-space:nowrap}
.v3-newprod{display:none;margin-top:8px;padding:12px;background:#f0fdf4;border:1px dashed #86efac;border-radius:9px}
.v3-newprod .g{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px}
.v3-newprod label{display:block;font-size:11.5px;color:#475569;margin-bottom:3px}
.v3-newprod .v3-in{width:100%}
.v3-items-wrap{margin-top:10px;border:1px solid #e2e8f0;border-radius:9px;overflow:hidden}
.v3-items{width:100%;border-collapse:collapse}
.v3-items thead th{background:#f1f5f9;color:#475569;font-size:12px;padding:8px;text-align:center}
.v3-items thead th:first-child{text-align:right}
.v3-items td{padding:8px;border-top:1px solid #f1f5f9;text-align:center;vertical-align:middle}
.v3-items td.nm{text-align:right}
.v3-items td.nm b{display:block;font-size:13.5px}
.v3-items td.nm small{color:#94a3b8;font-size:11.5px}
.v3-items input.inv-item-price{width:90px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;text-align:center}
.v3-step{display:inline-flex;align-items:center;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden}
.v3-step button{width:30px;height:32px;border:none;background:#f1f5f9;font-size:16px;cursor:pointer;color:#334155}
.v3-step input{width:52px;height:32px;border:none;text-align:center;font-size:14px;font-weight:700;background:#fff;color:#0f172a}
.inv-item-total-cell{font-weight:700;color:#0284c7;font-size:13.5px;white-space:nowrap}
.v3-del{background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;padding:6px 9px;cursor:pointer}
.v3-empty{padding:22px;text-align:center;color:#94a3b8;font-size:13.5px}
.v3-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.v3-two .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px}
.v3-two .v3-in{width:100%}
.v3-chips{display:flex;gap:6px;margin-top:7px}
.v3-chips button{border:1px solid #cbd5e1;background:#fff;border-radius:16px;padding:3px 12px;font-size:12px;cursor:pointer;color:#334155}
.v3-total{background:#0f172a;border-radius:10px;padding:14px;text-align:center;color:#94a3b8;font-size:13px;display:flex;flex-direction:column;justify-content:center}
.v3-total h2{margin:6px 0 0;color:#38bdf8;font-size:26px}
@media (max-width:700px){
 .v3-two{grid-template-columns:1fr}.v3-newcust{grid-template-columns:1fr}.v3-newprod .g{grid-template-columns:1fr 1fr}
 .v3-items thead{display:none}
 .v3-items tr{display:grid;grid-template-columns:1fr auto;gap:4px 8px;padding:8px;border-top:1px solid #f1f5f9}
 .v3-items td{border:none;padding:2px}
 .v3-items td.nm{grid-column:1/3}
}
`;

function injectV3Css() {
    if (document.getElementById('v3-css')) return;
    let st = document.createElement('style');
    st.id = 'v3-css';
    st.textContent = V3_CSS;
    document.head.appendChild(st);
}

function openPrintWindow(title, bodyHtml) {
    let w = window.open('', '_blank', 'width=1000,height=780');
    if (!w) { alert('المتصفح منع النافذة المنبثقة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.'); return; }
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${esc(title)}</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>body{padding:22px;background:#fff}${RP_CSS}</style></head>
        <body><div class="rp-wrap">${bodyHtml}</div>
        <div class="no-print" style="text-align:center;margin:20px"><button onclick="window.print()" style="background:#0284c7;color:#fff;border:none;padding:10px 24px;border-radius:7px;font-weight:700;cursor:pointer;font-size:14px">طباعة / حفظ PDF</button></div>
        </body></html>`);
    w.document.close();
}
function companyHeader(title, subtitle) {
    return `<div class="rp-head"><h1>${esc(settings.companyName || 'Bro Tech')} — ${esc(title)}</h1>
        <p>${esc(settings.address || '')} ${settings.whatsapp ? ' | ' + esc(settings.whatsapp) : ''}</p>
        ${subtitle ? `<p style="font-size:15px;color:#334155;margin-top:8px">${subtitle}</p>` : ''}</div>`;
}

// =====================================================================
// 1) كشف الحساب التفصيلي
// =====================================================================
let stCurrent = null; // اسم العميل المفتوح كشفه

function statementData(name, f) {
    f = f || {};
    let cust = customers.find(c => c.name === name);
    let rows = invoices.map((inv, idx) => ({ inv, idx })).filter(x => x.inv.customerName === name);
    rows.sort((a, b) => {
        let da = recDate(a.inv), db = recDate(b.inv);
        if (da && db && da - db !== 0) return da - db;
        return a.idx - b.idx;
    });
    rows.forEach(r => r.bd = invBreakdown(r.inv));

    let from = f.from ? new Date(f.from + 'T00:00:00') : null;
    let to = f.to ? new Date(f.to + 'T23:59:59') : null;
    let q = (f.q || '').toLowerCase().trim();
    let inRange = d => (!d) || ((!from || d >= from) && (!to || d <= to));

    rows = rows.filter(r => {
        if (!inRange(recDate(r.inv))) return false;
        let rem = r.bd.remaining;
        if (f.status === 'unpaid' && !(rem > 0.5)) return false;
        if (f.status === 'paid' && rem > 0.5) return false;
        if (f.status === 'partial' && !(rem > 0.5 && (r.bd.initial + r.bd.laterSum) > 0.5)) return false;
        if (q) {
            let hay = (r.inv.id + ' ' + (r.inv.items || []).map(i => i.name).join(' ')).toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    let sums = {
        count: rows.length,
        own: sumOf(rows, r => Number(r.inv.total || 0) - signedOldOf(r.inv)),
        cash: sumOf(rows, r => r.bd.initial + r.bd.laterSum),
        remaining: sumOf(rows, r => r.bd.remaining)
    };

    let mt = machineTotals(name);
    let mach = {
        entries: mt.entries.filter(e => inRange(recDate(e))),
        payments: mt.payments.filter(p => inRange(recDate(p))),
        total: mt.total, paid: mt.paid, remaining: mt.remaining
    };
    mach.fTotal = sumOf(mach.entries, e => e.total);
    mach.fPaid = sumOf(mach.payments, p => p.amount);

    let netDebt = getCustomerNetDebt(name);
    let oldStandalone = (cust && cust.balanceType !== 'none' && Number(cust.oldBalance) > 0)
        ? (cust.balanceType === 'on_him' ? Number(cust.oldBalance) : -Number(cust.oldBalance)) : 0;
    return { cust, rows, sums, mach, netDebt, oldStandalone };
}

function statementRowHtml(r) {
    let inv = r.inv, bd = r.bd, total = bd.total;
    let pct = total > 0 ? Math.min(100, Math.round(bd.initial / total * 100)) : 100;

    let oldNote = '';
    if (inv.oldBalance && Number(inv.oldBalance) > 0) {
        let on = inv.oldBalanceType === 'on_him';
        oldNote = `<div class="rp-note" style="color:${on ? '#b45309' : '#0369a1'}"><i class="fas fa-clock-rotate-left"></i> ${on ? 'شاملة حساب سابق عليه' : 'بعد خصم رصيد كان له'}: ${fmt(inv.oldBalance)} ج.م</div>`;
    }
    if (inv.carriedInvoices && inv.carriedInvoices.length) {
        oldNote += `<div class="rp-note" style="color:#6d28d9"><i class="fas fa-share"></i> رحّلت مديونية الفواتير: ${inv.carriedInvoices.map(c => esc(c.id) + ' (' + fmt(c.amount) + ')').join('، ')}</div>`;
    }

    let run = total - bd.initial;
    let histHtml = (inv.paymentHistory || []).map(p => {
        run -= Number(p.amount || 0);
        let isC = p.type === 'carried';
        let after = run > 0.5 ? `بقي ${fmt(run)} من ${fmt(total)}` : 'اكتمل السداد';
        return `<div class="rp-pay ${isC ? 'carried' : ''}"><i class="fas ${isC ? 'fa-share' : 'fa-hand-holding-dollar'}"></i>
            ${esc(p.date || '')} — ${isC ? 'رُحّل ' + fmt(p.amount) + ' ج.م إلى فاتورة ' + esc(p.toInvoice || 'أحدث') : 'سدد ' + fmt(p.amount) + ' ج.م'}
            <span class="rp-after">${after}</span>${(!isC && p.note) ? ' — ' + esc(p.note) : ''}</div>`;
    }).join('');

    let rem = bd.remaining, status;
    if (rem <= 0.5) status = (bd.carried > 0.5 || bd.legacySettled) ? ['rp-b-carry', 'سُوّيت ضمن فاتورة أحدث'] : ['rp-b-ok', 'مسددة بالكامل'];
    else if (bd.initial + bd.laterSum > 0.5) status = ['rp-b-part', 'سداد جزئي'];
    else status = ['rp-b-no', 'غير مسددة'];

    let ageNote = '';
    if (rem > 0.5) { let a = ageDaysOf(inv); if (a !== null) ageNote = `<div class="rp-note" style="color:#e11d48"><i class="fas fa-hourglass-half"></i> لها ${a} يوم</div>`; }

    let initCell = bd.legacySettled
        ? `<span class="rp-note">لم يُسجَّل تفصيل الدفع وقتها</span>`
        : `<div class="rp-paidof">دفع <b>${fmt(bd.initial)}</b> من ${fmt(total)} ج.م</div>
           <div class="rp-bar"><i style="width:${pct}%"></i></div>`;
    let items = (inv.items || []).map(i => `${esc(i.name)} × ${i.qty}`).join('، ') || '—';

    return `<tr>
        <td class="c" style="white-space:nowrap">${esc(inv.date || '')}</td>
        <td class="c"><b>${esc(inv.id)}</b></td>
        <td style="font-size:12px">${items}${oldNote}</td>
        <td class="c"><b>${fmt(total)}</b></td>
        <td>${initCell}</td>
        <td class="c" style="color:${rem > 0.5 ? '#e11d48' : '#059669'}"><b>${rem > 0.5 ? fmt(rem) + ' ج.م' : '0'}</b><br><span class="rp-b ${status[0]}">${status[1]}</span>${ageNote}</td>
    </tr>${histHtml ? `<tr class="rp-sub"><td colspan="6">${histHtml}</td></tr>` : ''}`;
}

function buildStatement(name, f) {
    let D = statementData(name, f);
    let S = D.sums, M = D.mach;
    let rowsHtml = D.rows.map(statementRowHtml).join('') ||
        `<tr><td colspan="6" class="c" style="padding:18px;color:#94a3b8">لا توجد فواتير مطابقة للفلتر الحالي</td></tr>`;

    let standalone = D.oldStandalone
        ? `<tr><td colspan="3" style="font-weight:700;color:${D.oldStandalone > 0 ? '#e11d48' : '#0284c7'}">${D.oldStandalone > 0 ? 'رصيد افتتاحي عليه' : 'رصيد افتتاحي له'} (غير مرتبط بفاتورة) ${D.cust.oldBalanceDate ? '— ' + esc(D.cust.oldBalanceDate) : ''}</td>
           <td colspan="3" class="c" style="font-weight:700">${fmt(Math.abs(D.oldStandalone))} ج.م</td></tr>` : '';

    let machHtml = '';
    if (M.entries.length || M.payments.length) {
        machHtml = `<div class="rp-h2">حساب المكن (منفصل عن الفواتير)</div>
        <table class="rp-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>
        ${M.entries.map(e => `<tr><td class="c">${esc(e.date)}</td><td class="c">${esc(e.kind || '')}</td><td>${esc(e.desc)}</td><td class="c">${e.qty}</td><td class="c">${fmt(e.price)}</td><td class="c"><b>${fmt(e.total)}</b></td></tr>`).join('')}
        ${M.payments.map(p => `<tr class="rp-sub"><td class="c">${esc(p.date)}</td><td class="c" colspan="4" style="color:#166534">دفعة على حساب المكن ${p.note ? '— ' + esc(p.note) : ''}</td><td class="c" style="color:#166534"><b>- ${fmt(p.amount)}</b></td></tr>`).join('')}
        <tr><td colspan="5" style="font-weight:700">المتبقي على حساب المكن</td><td class="c" style="font-weight:700;color:${M.remaining > 0.5 ? '#e11d48' : '#059669'}">${fmt(M.remaining)} ج.م</td></tr>
        </tbody></table>`;
    }

    let grand = D.netDebt + M.remaining;
    let netTxt = D.netDebt > 0.5 ? fmt(D.netDebt) + ' ج.م' : (D.netDebt < -0.5 ? 'له ' + fmt(Math.abs(D.netDebt)) + ' ج.م' : 'لا يوجد');
    let grandTxt = grand > 0.5 ? fmt(grand) + ' ج.م' : (grand < -0.5 ? 'له ' + fmt(Math.abs(grand)) + ' ج.م' : 'الحساب مسدد');
    let oldest = oldestAge(name);

    let html = `
        <div class="rp-sum">
            <div class="rp-card"><span>عدد الفواتير</span><b>${S.count}</b></div>
            <div class="rp-card"><span>قيمة الفواتير</span><b style="color:#0284c7">${fmt(S.own)}</b></div>
            <div class="rp-card"><span>المدفوع نقداً (ساعتها + لاحقاً)</span><b style="color:#059669">${fmt(S.cash)}</b></div>
            <div class="rp-card"><span>المتبقي على الفواتير</span><b style="color:#e11d48">${fmt(S.remaining)}</b></div>
        </div>
        <table class="rp-table"><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>الأصناف</th><th>إجمالي الفاتورة</th><th>دفع ساعتها (من الإجمالي)</th><th>المتبقي والحالة</th></tr></thead>
        <tbody>${rowsHtml}${standalone}</tbody></table>
        ${machHtml}
        <div class="rp-final">
            <div><span>مديونية الفواتير الآن</span><b>${netTxt}</b></div>
            <div><span>حساب المكن الآن</span><b>${M.remaining > 0.5 ? fmt(M.remaining) + ' ج.م' : (M.entries.length || M.payments.length ? 'مسدد' : '—')}</b></div>
            <div class="grand"><span>إجمالي المطلوب من العميل</span><b>${grandTxt}</b></div>
        </div>
        ${oldest !== null && oldest > 30 ? `<p style="color:#b45309;font-size:13px"><i class="fas fa-triangle-exclamation"></i> أقدم فاتورة غير مسددة عمرها ${oldest} يوم.</p>` : ''}`;

    // نص واتساب
    let unpaid = unpaidOf(name);
    let lines = [`*${settings.companyName || 'Bro Tech'}* — كشف حساب`, `العميل: ${name}`, ''];
    if (unpaid.length) {
        lines.push('الفواتير غير المسددة:');
        unpaid.forEach(({ inv }) => {
            let bd = invBreakdown(inv);
            lines.push(`• ${inv.id} (${inv.date}): دفع ${fmt(bd.initial + bd.laterSum)} من ${fmt(bd.total)} — المتبقي ${fmt(bd.remaining)} ج.م`);
        });
    } else lines.push('لا توجد فواتير غير مسددة.');
    if (D.oldStandalone > 0) lines.push(`رصيد سابق عليه: ${fmt(D.oldStandalone)} ج.م`);
    if (M.remaining > 0.5) lines.push(`حساب المكن المتبقي: ${fmt(M.remaining)} ج.م`);
    lines.push('', `*إجمالي المطلوب: ${grandTxt}*`, settings.whatsapp ? `للتواصل: ${settings.whatsapp}` : '');
    return { html, text: lines.join('\n'), data: D };
}

function stFilters() {
    return {
        from: document.getElementById('stFrom')?.value || '',
        to: document.getElementById('stTo')?.value || '',
        status: document.getElementById('stStatus')?.value || 'all',
        q: document.getElementById('stSearch')?.value || ''
    };
}
window.renderStatement = function () {
    let body = document.getElementById('stBody');
    if (!body || !stCurrent) return;
    body.innerHTML = `<div class="rp-wrap">${buildStatement(stCurrent, stFilters()).html}</div>`;
};
window.openStatement = function (name) {
    injectV3Modals();
    let sel = document.getElementById('stCustomer');
    let names = [...new Set([...customers.map(c => c.name), ...invoices.map(i => i.customerName)])].filter(Boolean);
    if (!names.length) { alert('لا يوجد عملاء مسجلين حالياً.'); return; }
    sel.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    stCurrent = names.includes(name) ? name : names[0];
    sel.value = stCurrent;
    ['stFrom', 'stTo', 'stSearch'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('stStatus').value = 'all';
    document.getElementById('stmtModal').style.display = 'flex';
    window.renderStatement();
};
window.stChangeCustomer = function () { stCurrent = document.getElementById('stCustomer').value; window.renderStatement(); };
window.stClear = function () {
    ['stFrom', 'stTo', 'stSearch'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('stStatus').value = 'all';
    window.renderStatement();
};
window.closeStatement = function () { document.getElementById('stmtModal').style.display = 'none'; stCurrent = null; };
window.stPrint = function () {
    if (!stCurrent) return;
    let B = buildStatement(stCurrent, stFilters());
    let f = stFilters();
    let sub = `العميل: <b>${esc(stCurrent)}</b> — تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}` +
        ((f.from || f.to) ? `<br><span style="font-size:12.5px;color:#64748b">الفترة: ${f.from || '...'} إلى ${f.to || '...'}</span>` : '');
    openPrintWindow('كشف حساب ' + stCurrent, companyHeader('كشف حساب عميل تفصيلي', sub) + B.html +
        `<div class="rp-sign"><div>توقيع المحاسب: ..................</div><div>توقيع العميل: ..................</div></div>`);
};
window.stWhats = function () {
    if (!stCurrent) return;
    let B = buildStatement(stCurrent, {});
    let phone = toLatinDigits((customers.find(c => c.name === stCurrent) || {}).phone || '').replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    else if (phone.startsWith('0')) phone = '20' + phone.slice(1);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(B.text)}`, '_blank');
};
window.stPay = function () { if (stCurrent) window.openCustPay(enc(stCurrent)); };
window.generateCustomerReport = function (name) { window.openStatement(name); };
window.generateCustomerReportEncoded = function (e) { window.openStatement(dec(e)); };
window.openCustomerAccountPrompt = function () {
    let menu = document.getElementById('reportMenuDropdown');
    if (menu) menu.style.display = 'none';
    window.openStatement();
};
window.viewInvoiceByIndex = function (i) { if (invoices[i]) window.showInvoiceModal(invoices[i]); };

// =====================================================================
// 2) سداد مديونية العميل (سريع FIFO / يدوي)
// =====================================================================
let cp = null; // حالة نافذة السداد

window.openCustPay = function (encName, preIdx) {
    injectV3Modals();
    let name = dec(encName);
    let cust = customers.find(c => c.name === name);
    let items = [];
    let od = custOldDebt(cust);
    if (od > 0.5) items.push({ kind: 'old', key: 'old', label: 'رصيد سابق', date: cust.oldBalanceDate || '—', total: od, remaining: od, age: null });
    unpaidOf(name).forEach(({ inv, idx }) => items.push({
        kind: 'inv', key: 'i' + idx, idx, label: inv.id, date: inv.date, total: Number(inv.total || 0),
        remaining: Number(inv.remaining || 0), age: ageDaysOf(inv)
    }));
    if (!items.length) { alert('هذا العميل ليس عليه أي مبالغ غير مسددة.'); return; }
    cp = { name, items, mode: (preIdx !== undefined && preIdx !== null && preIdx !== '') ? 'manual' : 'auto', manual: {} };
    if (cp.mode === 'manual') {
        let it = items.find(x => x.idx === Number(preIdx));
        if (it) cp.manual[it.key] = it.remaining;
    }
    document.getElementById('cpTitle').innerHTML = `<i class="fas fa-hand-holding-dollar"></i> سداد مديونية: ${esc(name)}`;
    document.getElementById('cpNote').value = '';
    document.getElementById('cpAmount').value = '';
    document.getElementById('custPayModal').style.display = 'flex';
    cpSetMode(cp.mode);
};
window.closeCustPay = function () { document.getElementById('custPayModal').style.display = 'none'; cp = null; };
window.cpSetMode = function (mode) {
    if (!cp) return;
    cp.mode = mode;
    document.getElementById('cpModeAuto').classList.toggle('on', mode === 'auto');
    document.getElementById('cpModeManual').classList.toggle('on', mode === 'manual');
    document.getElementById('cpAutoBox').style.display = mode === 'auto' ? 'flex' : 'none';
    let due = sumOf(cp.items, x => x.remaining);
    document.getElementById('cpDue').innerText = fmt(due) + ' ج.م';
    document.getElementById('cpCount').innerText = cp.items.length;
    document.getElementById('cpHint').innerText = mode === 'auto'
        ? 'اكتب المبلغ اللي العميل دفعه، وهيتوزع تلقائياً على الأقدم فالأحدث.'
        : 'اكتب المبلغ قدّام كل فاتورة هتسددها (أو اضغط "كامل").';
    document.getElementById('cpRows').innerHTML = cp.items.map(it => `
        <tr><td>${esc(it.date)}</td><td><b>${esc(it.label)}</b></td><td>${fmt(it.total)}</td><td style="color:#e11d48;font-weight:700">${fmt(it.remaining)}</td>
        <td>${it.age === null ? '—' : `<span class="age-pill" style="background:${BUCKET_COLORS[bucketOf(it.age)]}20;color:${BUCKET_COLORS[bucketOf(it.age)]}">${it.age} يوم</span>`}</td>
        <td>${mode === 'auto'
            ? `<b id="cpA_${it.key}">0</b>`
            : `<input type="number" class="v3-in" min="0" max="${it.remaining}" id="cpM_${it.key}" value="${cp.manual[it.key] || ''}" oninput="cpRecalc()"> <button type="button" class="v3-btn sm green" onclick="cpFull('${it.key}')">كامل</button>`}</td></tr>`).join('');
    cpRecalc();
};
window.cpFull = function (key) {
    let it = cp.items.find(x => x.key === key);
    let el = document.getElementById('cpM_' + key);
    if (it && el) { el.value = it.remaining; cpRecalc(); }
};
window.cpPayAll = function () {
    document.getElementById('cpAmount').value = sumOf(cp.items, x => x.remaining);
    cpRecalc();
};
function cpAllocs() {
    let allocs = [], total = 0, excess = 0;
    if (cp.mode === 'auto') {
        let left = Number(document.getElementById('cpAmount').value) || 0;
        cp.items.forEach(it => {
            let a = Math.max(0, Math.min(it.remaining, left));
            left -= a; allocs.push({ it, amount: a }); total += a;
        });
        excess = Math.max(0, left);
    } else {
        cp.items.forEach(it => {
            let v = Number(document.getElementById('cpM_' + it.key)?.value) || 0;
            if (v > it.remaining + 0.001) excess += v - it.remaining;
            let a = Math.max(0, Math.min(it.remaining, v));
            allocs.push({ it, amount: a }); total += a;
        });
    }
    return { allocs, total, excess };
}
window.cpRecalc = function () {
    if (!cp) return;
    let R = cpAllocs();
    if (cp.mode === 'auto') R.allocs.forEach(a => { let el = document.getElementById('cpA_' + a.it.key); if (el) el.innerText = fmt(a.amount); });
    let sum = document.getElementById('cpSummary'), btn = document.getElementById('cpConfirm');
    let dueAfter = sumOf(cp.items, x => x.remaining) - R.total;
    if (R.excess > 0.001) {
        sum.className = 'cp-sum err';
        sum.innerHTML = `<i class="fas fa-triangle-exclamation"></i> المبلغ أكبر من المستحق بـ ${fmt(R.excess)} ج.م — عدّل المبلغ.`;
        btn.disabled = true;
    } else {
        sum.className = 'cp-sum';
        sum.innerHTML = R.total > 0
            ? `سيتم تسجيل سداد <b>${fmt(R.total)} ج.م</b> — يتبقى على العميل <b>${fmt(dueAfter)} ج.م</b>`
            : 'اكتب مبلغ السداد لتظهر التفاصيل.';
        btn.disabled = R.total <= 0;
    }
};
window.cpConfirm = function () {
    if (!cp) return;
    let R = cpAllocs();
    if (R.total <= 0 || R.excess > 0.001) return;
    let note = document.getElementById('cpNote').value.trim();
    let now = new Date();
    let receiptNo = 'RC-' + String(Date.now()).slice(-6);
    let cust = customers.find(c => c.name === cp.name);
    let receiptLines = [];

    R.allocs.filter(a => a.amount > 0).forEach(a => {
        if (a.it.kind === 'inv') {
            let inv = invoices[a.it.idx];
            if (inv.initialPaid == null) inv.initialPaid = invBreakdown(inv).initial; // نثبّت "دفع ساعتها" قبل أي تعديل
            inv.paid = Number(inv.paid || 0) + a.amount;
            inv.remaining = Math.max(0, Number(inv.remaining || 0) - a.amount);
            inv.status = inv.remaining <= 0.5 ? 'تم الدفع بالكامل' : `متبقي: ${inv.remaining} ج.م`;
            if (!inv.paymentHistory) inv.paymentHistory = [];
            inv.paymentHistory.push({ amount: a.amount, type: 'cash', date: now.toLocaleString('ar-EG'), dateISO: now.toISOString(), note, receiptNo });
            receiptLines.push({ label: inv.id, date: inv.date, total: Number(inv.total), paid: a.amount, left: inv.remaining });
        } else if (cust) {
            cust.oldBalance = Math.max(0, Number(cust.oldBalance) - a.amount);
            if (!cust.balancePayments) cust.balancePayments = [];
            cust.balancePayments.push({ amount: a.amount, date: now.toLocaleString('ar-EG'), dateISO: now.toISOString(), note, receiptNo });
            if (cust.oldBalance <= 0.5) { cust.oldBalance = 0; cust.balanceType = 'none'; cust.oldBalanceDate = ''; }
            receiptLines.push({ label: 'رصيد سابق', date: a.it.date, total: a.it.total, paid: a.amount, left: cust.oldBalance });
        }
    });

    saveData();
    refreshAllData();
    let name = cp.name, total = R.total;
    window.closeCustPay();
    if (stCurrent) window.renderStatement();

    // إيصال استلام
    let netAfter = getCustomerNetDebt(name);
    let body = companyHeader('إيصال استلام نقدية', `رقم الإيصال: <b>${receiptNo}</b> — ${now.toLocaleString('ar-EG')}`) +
        `<p style="font-size:14px">استلمنا من السيد/ة: <b>${esc(name)}</b> مبلغ <b>${fmt(total)} ج.م</b> سداداً على:</p>
        <table class="rp-table"><thead><tr><th>البند</th><th>التاريخ</th><th>إجمالي الفاتورة</th><th>المسدد الآن</th><th>المتبقي بعد السداد</th></tr></thead><tbody>
        ${receiptLines.map(l => `<tr><td class="c"><b>${esc(l.label)}</b></td><td class="c">${esc(l.date)}</td><td class="c">${fmt(l.total)}</td><td class="c" style="color:#059669"><b>${fmt(l.paid)}</b></td><td class="c" style="color:${l.left > 0.5 ? '#e11d48' : '#059669'}">${l.left > 0.5 ? fmt(l.left) : 'مسددة'}</td></tr>`).join('')}
        </tbody></table>
        ${note ? `<p class="rp-note" style="color:#475569">ملاحظة: ${esc(note)}</p>` : ''}
        <div class="rp-final" style="grid-template-columns:1fr 1fr"><div><span>المبلغ المستلم</span><b>${fmt(total)} ج.م</b></div><div class="grand"><span>إجمالي المتبقي على العميل (فواتير)</span><b>${netAfter > 0.5 ? fmt(netAfter) + ' ج.م' : 'لا يوجد'}</b></div></div>
        <div class="rp-sign"><div>المستلم: ..................</div><div>العميل: ..................</div></div>`;
    openPrintWindow('إيصال ' + receiptNo, body);
};

// =====================================================================
// 3) دليل العملاء الجديد + أعمار الديون
// =====================================================================
let custExpanded = new Set();

function renderAgingStrip() {
    let box = document.getElementById('custAgingStrip');
    if (!box) return;
    let A = agingTotals();
    let cur = document.getElementById('custDebtFilter')?.value || 'all';
    let keys = ['', 'over30', 'over60', 'over90'];
    box.innerHTML = A.totals.map((t, i) => `
        <div class="aging-card ${cur === keys[i] ? 'on' : ''}" style="border-top-color:${BUCKET_COLORS[i]}" onclick="setCustFilter('${i === 0 ? 'debt' : keys[i]}')">
            <span>${BUCKET_LABELS[i]}</span><b>${fmt(t)} ج.م</b><br><small>${A.counts[i]} فاتورة غير مسددة</small>
        </div>`).join('');
}
window.setCustFilter = function (v) {
    let sel = document.getElementById('custDebtFilter');
    if (sel) sel.value = (sel.value === v) ? 'all' : v;
    renderCustomers();
};
window.toggleCustUnpaid = function (e) {
    let n = dec(e);
    custExpanded.has(n) ? custExpanded.delete(n) : custExpanded.add(n);
    renderCustomers();
};
window.filterCustomers = function () { renderCustomers(); };

function renderCustomers() {
    let tbody = document.getElementById('customersTableBody');
    if (!tbody) return;
    renderAgingStrip();
    let q = (document.getElementById('searchCustomers')?.value || '').toLowerCase().trim();
    let flt = document.getElementById('custDebtFilter')?.value || 'all';
    let html = '', shown = 0;

    customers.forEach((c, index) => {
        if (q && !((c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))) return;
        let unpaid = unpaidOf(c.name);
        let netDebt = getCustomerNetDebt(c.name);
        let mt = machineTotals(c.name);
        let oldest = oldestAge(c.name);

        if (flt === 'debt' && !(netDebt > 0.5 || mt.remaining > 0.5)) return;
        if (flt === 'over30' && !(oldest !== null && oldest > 30)) return;
        if (flt === 'over60' && !(oldest !== null && oldest > 60)) return;
        if (flt === 'over90' && !(oldest !== null && oldest > 90)) return;
        if (flt === 'credit' && !(netDebt < -0.5)) return;
        shown++;

        let custInvoices = invoices.filter(i => i.customerName === c.name);
        let totalSales = sumOf(custInvoices, i => i.total);
        let lastPurchase = custInvoices.length ? custInvoices[custInvoices.length - 1].date : '—';
        let en = enc(c.name);

        let debtHtml = netDebt > 0.5 ? `<span class="badge-danger"><i class="fas fa-arrow-down"></i> ${fmt(netDebt)} ج.م</span>`
            : netDebt < -0.5 ? `<span class="badge-success"><i class="fas fa-arrow-up"></i> له رصيد ${fmt(Math.abs(netDebt))} ج.م</span>`
                : `<span class="badge-neutral">لا يوجد</span>`;
        let ageHtml = '';
        if (unpaid.length) {
            let col = BUCKET_COLORS[bucketOf(oldest)];
            ageHtml = `<div style="margin-top:5px"><button class="toggle-unpaid" onclick="toggleCustUnpaid('${en}')"><i class="fas fa-chevron-${custExpanded.has(c.name) ? 'up' : 'down'}"></i> ${unpaid.length} فاتورة غير مسددة</button>
                ${oldest !== null ? `<span class="age-pill" style="background:${col}20;color:${col}">أقدمها ${oldest} يوم</span>` : ''}</div>`;
        }
        let machHtml = mt.remaining > 0.5 ? `<span class="badge-danger">${fmt(mt.remaining)} ج.م</span>`
            : ((mt.entries.length) ? `<span class="badge-success">مسدد</span>` : '<span class="badge-neutral">—</span>');
        let grand = netDebt + mt.remaining;
        let grandHtml = grand > 0.5 ? `<strong style="color:#b91c1c">${fmt(grand)} ج.م</strong>` : (grand < -0.5 ? `<strong style="color:#059669">له ${fmt(Math.abs(grand))}</strong>` : `<span class="badge-neutral">0</span>`);

        html += `<tr>
            <td><strong>${esc(c.name)}</strong><div class="v3-muted">مشترياته: ${fmt(totalSales)} ج.م</div></td>
            <td>${esc(c.phone || 'غير مسجل')}</td>
            <td>${debtHtml}${ageHtml}</td>
            <td>${machHtml}</td>
            <td>${grandHtml}</td>
            <td>${esc(lastPurchase)}</td>
            <td><div class="row-actions">
                ${(netDebt > 0.5) ? `<button onclick="openCustPay('${en}')" class="btn-action btn-pay-sm" title="تسجيل سداد"><i class="fas fa-hand-holding-dollar"></i> سداد</button>` : ''}
                <button onclick="generateCustomerReportEncoded('${en}')" class="btn-action btn-view-sm" title="كشف حساب تفصيلي"><i class="fas fa-file-invoice"></i> كشف</button>
                <button onclick="mcOpenFor('${en}')" class="btn-action" style="background:#7c3aed" title="حساب المكن"><i class="fas fa-gears"></i> مكن</button>
                <button onclick="openEditCustomerModal(${index})" class="btn-action btn-edit-sm" title="تعديل"><i class="fas fa-edit"></i></button>
                <button onclick="deleteCustomer(${index})" class="btn-action btn-danger-sm" title="حذف"><i class="fas fa-trash"></i></button>
            </div></td></tr>`;

        if (custExpanded.has(c.name) && unpaid.length) {
            html += `<tr class="cust-sub"><td colspan="7">${unpaid.map(({ inv, idx }) => {
                let bd = invBreakdown(inv), a = ageDaysOf(inv), col = BUCKET_COLORS[bucketOf(a)];
                return `<div class="cust-inv"><div class="grow"><b>${esc(inv.id)}</b> — ${esc(inv.date)}
                    <span class="v3-muted">| دفع ${fmt(bd.initial + bd.laterSum)} من ${fmt(bd.total)} ج.م</span></div>
                    <span style="color:#e11d48;font-weight:700">المتبقي ${fmt(bd.remaining)} ج.م</span>
                    ${a !== null ? `<span class="age-pill" style="background:${col}20;color:${col}">${a} يوم</span>` : ''}
                    <button class="v3-btn sm green" onclick="openCustPay('${en}', ${idx})"><i class="fas fa-hand-holding-dollar"></i> سدّد</button>
                    <button class="v3-btn sm gray" onclick="viewInvoiceByIndex(${idx})"><i class="fas fa-eye"></i></button></div>`;
            }).join('')}</td></tr>`;
        }
    });

    tbody.innerHTML = html || `<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8">لا يوجد عملاء مطابقين</td></tr>`;
}

// تنبيه المتأخرين في لوحة المؤشرات
function renderOverdueAlert() {
    let tab = document.getElementById('tab-dashboard');
    if (!tab) return;
    let box = document.getElementById('overdueAlert');
    if (!box) { box = document.createElement('div'); box.id = 'overdueAlert'; tab.insertBefore(box, tab.firstChild); }
    let list = customers.map(c => ({ name: c.name, age: oldestAge(c.name), amt: sumOf(unpaidOf(c.name).filter(x => (ageDaysOf(x.inv) || 0) > 30), x => x.inv.remaining) }))
        .filter(x => x.age !== null && x.age > 30).sort((a, b) => b.age - a.age);
    if (!list.length) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    box.innerHTML = `<i class="fas fa-bell" style="font-size:22px;color:#ea580c"></i>
        <div class="txt"><b>${list.length} عميل متأخر في السداد أكثر من 30 يوم</b> — إجمالي المتأخر ${fmt(sumOf(list, x => x.amt))} ج.م<br>
        ${list.slice(0, 3).map(x => `${esc(x.name)} (${x.age} يوم)`).join(' • ')}${list.length > 3 ? ' ...' : ''}</div>
        <button class="v3-btn amber" onclick="showOverdue()">عرض المتأخرين</button>`;
}

window.showOverdue = function () {
    gotoTab('customers');
    let sel = document.getElementById('custDebtFilter');
    if (sel) sel.value = 'over30';
    renderCustomers();
};
window.openStatementEnc = function (e) { window.openStatement(dec(e)); };

// =====================================================================
// 4) حساب المكن (منفصل تماماً عن الفواتير والمخزون)
// =====================================================================
let mcSel = null;

function mcCards(t) {
    return `<div class="mc-cards">
        <div><span>إجمالي الحساب</span><b style="color:#0284c7">${fmt(t.total)} ج.م</b></div>
        <div><span>المدفوع</span><b style="color:#059669">${fmt(t.paid)} ج.م</b></div>
        <div><span>المتبقي</span><b style="color:${t.remaining > 0.5 ? '#e11d48' : '#059669'}">${fmt(t.remaining)} ج.م</b></div></div>`;
}
function todayInput() { let d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dateFromInput(v) {
    let d = v ? new Date(v + 'T12:00:00') : new Date();
    return { date: d.toLocaleDateString('ar-EG'), dateISO: d.toISOString() };
}

function renderMachinesTab() {
    let root = document.getElementById('mcRoot');
    if (!root) return;
    if (mcSel) { root.innerHTML = mcDetailHtml(mcSel); return; }

    let names = [...new Set([...machineEntries.map(e => e.customerName), ...machinePayments.map(p => p.customerName)])];
    let rows = names.map(n => ({ n, t: machineTotals(n) }));
    let all = { total: sumOf(rows, r => r.t.total), paid: sumOf(rows, r => r.t.paid), remaining: sumOf(rows, r => r.t.remaining) };
    root.innerHTML = `
        <div class="page-header-title"><h1>حساب المكن</h1>
        <p>حساب يدوي منفصل عن الفواتير والمخزون: مكن، صيانة، قطع غيار — اكتب البند وسعره والبرنامج يحسب إجمالي كل عميل</p></div>
        ${mcCards(all)}
        <div class="mc-pick"><input class="v3-in" id="mcPick" list="mcCustList" placeholder="اكتب اسم العميل (موجود أو جديد) لفتح حساب المكن…" onkeydown="if(event.key==='Enter')mcOpen()">
            <datalist id="mcCustList">${customers.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
            <button class="v3-btn" onclick="mcOpen()"><i class="fas fa-folder-open"></i> فتح / بدء حساب</button></div>
        <div class="card-table-wrapper"><div class="table-responsive"><table class="data-table"><thead><tr>
            <th>العميل</th><th>عدد البنود</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><strong>${esc(r.n)}</strong></td><td>${r.t.entries.length}</td><td>${fmt(r.t.total)}</td><td style="color:#059669">${fmt(r.t.paid)}</td>
            <td>${r.t.remaining > 0.5 ? `<span class="badge-danger">${fmt(r.t.remaining)} ج.م</span>` : '<span class="badge-success">مسدد</span>'}</td>
            <td><button class="v3-btn sm" onclick="mcOpenFor('${enc(r.n)}')">فتح الحساب</button></td></tr>`).join('') ||
        '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">لا توجد حسابات مكن بعد. اكتب اسم عميل فوق وابدأ.</td></tr>'}
        </tbody></table></div></div>`;
}

function mcDetailHtml(name) {
    let t = machineTotals(name);
    let kinds = ['مكنة', 'صيانة', 'قطع غيار', 'أخرى'];
    return `
        <div class="page-header-title flex-header"><div><h1><i class="fas fa-gears"></i> حساب المكن: ${esc(name)}</h1>
        <p>بنود يدوية — لا تؤثر على الفواتير ولا المخزون</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="v3-btn gray" onclick="mcBack()"><i class="fas fa-arrow-right"></i> كل الحسابات</button>
            <button class="v3-btn" onclick="mcPrint()"><i class="fas fa-print"></i> طباعة فاتورة المكن</button>
            <button class="v3-btn wa" onclick="mcWhats()"><i class="fab fa-whatsapp"></i> واتساب</button>
            <button class="v3-btn amber" onclick="openStatement(mcSelName())"><i class="fas fa-file-invoice"></i> الكشف الشامل</button>
        </div></div>
        ${mcCards(t)}
        <h3 class="rp-h2">إضافة بند</h3>
        <div class="mc-form">
            <div><label>التاريخ</label><input class="v3-in" type="date" id="mcDate" value="${todayInput()}"></div>
            <div><label>النوع</label><select class="v3-in" id="mcKind">${kinds.map(k => `<option>${k}</option>`).join('')}</select></div>
            <div><label>البند (مثلاً: مكنة بورده / هيد)</label><input class="v3-in" id="mcDesc" placeholder="اسم المنتج أو الخدمة" onkeydown="if(event.key==='Enter')document.getElementById('mcPrice').focus()"></div>
            <div><label>الكمية</label><input class="v3-in" type="number" id="mcQty" value="1" min="1" oninput="mcPreview()"></div>
            <div><label>السعر</label><input class="v3-in" type="number" id="mcPrice" min="0" placeholder="0" oninput="mcPreview()" onkeydown="if(event.key==='Enter')mcAddEntry()"></div>
            <button class="v3-btn green" onclick="mcAddEntry()"><i class="fas fa-plus"></i> إضافة <span id="mcPrev"></span></button>
        </div>
        <div class="card-table-wrapper"><div class="table-responsive"><table class="data-table"><thead><tr>
            <th>التاريخ</th><th>النوع</th><th>البند</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead><tbody>
        ${t.entries.map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.kind || '')}</td><td>${esc(e.desc)}</td><td>${e.qty}</td><td>${fmt(e.price)}</td><td><b>${fmt(e.total)}</b></td>
            <td><button class="btn-action btn-danger-sm" onclick="mcDelEntry('${e.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('') ||
        '<tr><td colspan="7" style="text-align:center;padding:16px;color:#94a3b8">لا توجد بنود</td></tr>'}
        </tbody></table></div></div>
        <h3 class="rp-h2">تسجيل دفعة</h3>
        <div class="mc-form pay">
            <div><label>التاريخ</label><input class="v3-in" type="date" id="mcPayDate" value="${todayInput()}"></div>
            <div><label>المبلغ</label><input class="v3-in" type="number" id="mcPayAmt" min="0" placeholder="0" onkeydown="if(event.key==='Enter')mcAddPay()"></div>
            <div><label>ملاحظة</label><input class="v3-in" id="mcPayNote" placeholder="اختياري"></div>
            <button class="v3-btn green" onclick="mcAddPay()"><i class="fas fa-hand-holding-dollar"></i> تسجيل الدفعة</button>
        </div>
        ${t.payments.length ? `<div class="card-table-wrapper"><div class="table-responsive"><table class="data-table"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr></thead><tbody>
        ${t.payments.map(p => `<tr><td>${esc(p.date)}</td><td style="color:#059669"><b>${fmt(p.amount)}</b></td><td>${esc(p.note || '')}</td>
            <td><button class="btn-action btn-danger-sm" onclick="mcDelPay('${p.id}')"><i class="fas fa-trash"></i></button></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}`;
}

window.mcSelName = function () { return mcSel; };
window.mcPreview = function () {
    let q = Number(document.getElementById('mcQty')?.value) || 0, p = Number(document.getElementById('mcPrice')?.value) || 0;
    let el = document.getElementById('mcPrev');
    if (el) el.innerText = q * p ? '(' + fmt(q * p) + ')' : '';
};
window.mcOpen = function () {
    let n = (document.getElementById('mcPick')?.value || '').trim();
    if (!n) { alert('اكتب اسم العميل أولاً.'); return; }
    if (!customers.some(c => c.name === n)) {
        if (!confirm(`"${n}" غير مسجل في دليل العملاء. هل تريد إضافته كعميل جديد؟`)) return;
        customers.push({ name: n, phone: '', address: '', oldBalance: 0, balanceType: 'none', oldBalanceDate: '' });
        saveData(); refreshAllData();
    }
    mcSel = n; renderMachinesTab();
};
window.mcOpenFor = function (e) { mcSel = dec(e); gotoTab('machines'); renderMachinesTab(); };
window.mcBack = function () { mcSel = null; renderMachinesTab(); };
window.mcAddEntry = function () {
    let desc = document.getElementById('mcDesc').value.trim();
    let qty = Number(document.getElementById('mcQty').value) || 0;
    let price = Number(document.getElementById('mcPrice').value);
    if (!desc) { alert('اكتب اسم البند.'); document.getElementById('mcDesc').focus(); return; }
    if (qty <= 0 || isNaN(price) || price < 0) { alert('راجع الكمية والسعر.'); return; }
    let d = dateFromInput(document.getElementById('mcDate').value);
    machineEntries.push({ id: 'ME-' + Date.now(), customerName: mcSel, ...d, kind: document.getElementById('mcKind').value, desc, qty, price, total: qty * price });
    saveData(); renderMachinesTab(); renderCustomers();
    setTimeout(() => document.getElementById('mcDesc')?.focus(), 30);
};
window.mcDelEntry = function (id) {
    if (!confirm('حذف هذا البند؟')) return;
    machineEntries = machineEntries.filter(e => e.id !== id);
    saveData(); renderMachinesTab(); renderCustomers();
};
window.mcAddPay = function () {
    let amt = Number(document.getElementById('mcPayAmt').value) || 0;
    if (amt <= 0) { alert('اكتب مبلغ الدفعة.'); return; }
    let t = machineTotals(mcSel);
    if (amt > t.remaining + 0.5 && !confirm(`الدفعة (${fmt(amt)}) أكبر من المتبقي (${fmt(t.remaining)}). هل تريد المتابعة؟`)) return;
    let d = dateFromInput(document.getElementById('mcPayDate').value);
    machinePayments.push({ id: 'MP-' + Date.now(), customerName: mcSel, amount: amt, ...d, note: document.getElementById('mcPayNote').value.trim() });
    saveData(); renderMachinesTab(); renderCustomers();
};
window.mcDelPay = function (id) {
    if (!confirm('حذف هذه الدفعة؟')) return;
    machinePayments = machinePayments.filter(p => p.id !== id);
    saveData(); renderMachinesTab(); renderCustomers();
};
function mcInvoiceHtml(name) {
    let t = machineTotals(name);
    return companyHeader('فاتورة / كشف حساب المكن', `العميل: <b>${esc(name)}</b> — ${new Date().toLocaleDateString('ar-EG')}`) +
        `<table class="rp-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>البند</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>
        ${t.entries.map(e => `<tr><td class="c">${esc(e.date)}</td><td class="c">${esc(e.kind || '')}</td><td>${esc(e.desc)}</td><td class="c">${e.qty}</td><td class="c">${fmt(e.price)}</td><td class="c"><b>${fmt(e.total)}</b></td></tr>`).join('')}
        ${t.payments.map(p => `<tr class="rp-sub"><td class="c">${esc(p.date)}</td><td colspan="4" style="color:#166534">دفعة ${p.note ? '— ' + esc(p.note) : ''}</td><td class="c" style="color:#166534"><b>- ${fmt(p.amount)}</b></td></tr>`).join('')}
        </tbody></table>
        <div class="rp-final"><div><span>إجمالي البنود</span><b>${fmt(t.total)} ج.م</b></div><div><span>المدفوع</span><b>${fmt(t.paid)} ج.م</b></div><div class="grand"><span>المتبقي</span><b>${fmt(t.remaining)} ج.م</b></div></div>
        <div class="rp-sign"><div>المحاسب: ..................</div><div>العميل: ..................</div></div>`;
}
window.mcPrint = function () { if (mcSel) openPrintWindow('حساب المكن ' + mcSel, mcInvoiceHtml(mcSel)); };
window.mcWhats = function () {
    let t = machineTotals(mcSel);
    let lines = [`*${settings.companyName || 'Bro Tech'}* — حساب المكن`, `العميل: ${mcSel}`, ''];
    t.entries.forEach(e => lines.push(`• ${e.desc} (${e.kind || ''}) × ${e.qty} = ${fmt(e.total)} ج.م`));
    lines.push('', `الإجمالي: ${fmt(t.total)} ج.م`, `المدفوع: ${fmt(t.paid)} ج.م`, `*المتبقي: ${fmt(t.remaining)} ج.م*`);
    let phone = toLatinDigits((customers.find(c => c.name === mcSel) || {}).phone || '').replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2); else if (phone.startsWith('0')) phone = '20' + phone.slice(1);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
};

// =====================================================================
// 5) نسخ احتياطي JSON / Excel + استرجاع
// =====================================================================
function backupPayload() {
    let { password, ...safeSettings } = settings; // لا نصدّر كلمة المرور
    return {
        _app: 'ProTech', _version: 3, exportedAt: new Date().toISOString(),
        inventory, customers, invoices, purchases, companyExpenses, machineEntries, machinePayments, settings: safeSettings
    };
}
function downloadBlob(blob, name) {
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function stamp() { return new Date().toISOString().slice(0, 10); }

window.exportBackupJSON = function () {
    downloadBlob(new Blob([JSON.stringify(backupPayload(), null, 2)], { type: 'application/json' }), `protech-backup-${stamp()}.json`);
};
window.exportBackupExcel = function () {
    const build = () => {
        let wb = XLSX.utils.book_new();
        const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ ملاحظة: 'لا توجد بيانات' }]), name);
        add('العملاء', customers.map(c => ({ الاسم: c.name, الهاتف: c.phone, العنوان: c.address, 'رصيد سابق': c.oldBalance, النوع: c.balanceType, 'مديونية حالية': getCustomerNetDebt(c.name), 'متبقي المكن': machineTotals(c.name).remaining })));
        add('الفواتير', invoices.map(i => { let b = invBreakdown(i); return { الرقم: i.id, التاريخ: i.date, العميل: i.customerName, الإجمالي: i.total, 'دفع ساعتها': b.initial, 'سداد لاحق': b.laterSum, مُرحّل: b.carried, المتبقي: i.remaining, الحالة: i.status }; }));
        add('بنود الفواتير', invoices.flatMap(i => (i.items || []).map(it => ({ الفاتورة: i.id, العميل: i.customerName, الصنف: it.name, الكمية: it.qty, السعر: it.price, الإجمالي: it.total }))));
        add('دفعات الفواتير', invoices.flatMap(i => (i.paymentHistory || []).map(p => ({ الفاتورة: i.id, العميل: i.customerName, التاريخ: p.date, المبلغ: p.amount, النوع: p.type === 'carried' ? 'مُرحّل' : 'نقدي', ملاحظة: p.note || '' }))));
        add('المخزون', inventory.map(p => ({ الكود: p.code, الصنف: p.name, الكمية: p.qty, الوحدة: p.unit, السعر: p.price })));
        add('المشتريات', purchases.map(p => ({ ...p })));
        add('المصروفات', companyExpenses.map(p => ({ ...p })));
        add('حساب المكن', machineEntries.map(e => ({ العميل: e.customerName, التاريخ: e.date, النوع: e.kind, البند: e.desc, الكمية: e.qty, السعر: e.price, الإجمالي: e.total })));
        add('دفعات المكن', machinePayments.map(p => ({ العميل: p.customerName, التاريخ: p.date, المبلغ: p.amount, ملاحظة: p.note || '' })));
        XLSX.writeFile(wb, `protech-backup-${stamp()}.xlsx`);
    };
    if (window.XLSX) return build();
    let s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = build;
    s.onerror = () => alert('تعذر تحميل مكتبة Excel (تحقق من الإنترنت). استخدم نسخة JSON مؤقتاً.');
    document.head.appendChild(s);
};
window.importBackupJSON = function (ev) {
    let file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    let reader = new FileReader();
    reader.onload = () => {
        try {
            let d = JSON.parse(reader.result);
            if (!Array.isArray(d.customers) || !Array.isArray(d.invoices)) throw new Error('bad');
            if (!confirm(`سيتم استبدال كل البيانات الحالية بالنسخة (${d.invoices.length} فاتورة، ${d.customers.length} عميل). هل أنت متأكد؟`)) return;
            if (!confirm('تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه. يُنصح بتصدير نسخة من البيانات الحالية أولاً. المتابعة؟')) return;
            if (Array.isArray(d.inventory)) inventory = d.inventory;
            customers = d.customers; invoices = d.invoices;
            purchases = d.purchases || []; companyExpenses = d.companyExpenses || [];
            machineEntries = d.machineEntries || []; machinePayments = d.machinePayments || [];
            if (d.settings) settings = { ...settings, ...d.settings, password: settings.password };
            saveData(); refreshAllData();
            alert('تم استرجاع النسخة الاحتياطية بنجاح.');
        } catch (e) { alert('الملف غير صالح. اختر ملف نسخة احتياطية JSON صادر من البرنامج.'); }
    };
    reader.readAsText(file);
};
function injectBackupCard() {
    let tab = document.getElementById('tab-settings');
    if (!tab || document.getElementById('backupCard')) return;
    let card = document.createElement('div');
    card.id = 'backupCard'; card.className = 'bk-card';
    card.innerHTML = `<h3><i class="fas fa-database"></i> النسخ الاحتياطي</h3>
        <p class="v3-muted">صدّر كل البيانات (العملاء، الفواتير والدفعات، المخزون، المكن...) كنسخة تحفظها على جهازك. لا تتضمن كلمة المرور.</p>
        <div class="bk-row">
            <button class="v3-btn" onclick="exportBackupJSON()"><i class="fas fa-file-code"></i> تصدير JSON</button>
            <button class="v3-btn green" onclick="exportBackupExcel()"><i class="fas fa-file-excel"></i> تصدير Excel</button>
            <button class="v3-btn gray" onclick="document.getElementById('bkFile').click()"><i class="fas fa-upload"></i> استرجاع من JSON</button>
            <input type="file" id="bkFile" accept=".json,application/json" style="display:none" onchange="importBackupJSON(event)">
        </div>`;
    tab.appendChild(card);
}

// =====================================================================
// 6) نموذج الفاتورة الجديد (فاتح وبسيط) + إضافة صنف جديد من داخله
// =====================================================================
function injectInvoiceModalV2() {
    let modal = document.getElementById('newInvoiceModal');
    if (!modal || modal.dataset.v3) return;
    modal.dataset.v3 = '1';
    modal.innerHTML = `
    <div class="modal-content v3-inv">
      <div class="v3-inv-head"><h3 id="invoiceFormTitle"><i class="fas fa-file-invoice-dollar"></i> إنشاء فاتورة مبيعات جديدة</h3>
        <span class="close-btn" onclick="closeNewInvoiceModal()">&times;</span></div>
      <div class="v3-inv-body">
        <input type="hidden" id="editingInvoiceIndex" value="">
        <div class="v3-sec">
          <label class="v3-lab">1) العميل</label>
          <select id="invoiceCustomerSelect" onchange="handleCustomerSelectChange()"><option value="">-- اختر عميل مسجل --</option></select>
          <div id="newCustomerDiv" class="v3-newcust" style="display:none">
            <input class="v3-in" type="text" id="newCustomerName" placeholder="اسم العميل الجديد">
            <input class="v3-in" type="text" id="newCustomerPhone" placeholder="رقم الهاتف">
            <input class="v3-in" type="text" id="newCustomerAddress" placeholder="العنوان">
          </div>
          <div id="custDebtInfoBox" class="v3-info" style="display:none"></div>
          <div id="includeOldBalanceRow" class="v3-incl" style="display:none">
            <input type="checkbox" id="includeOldBalanceCheckbox" onchange="toggleIncludeOldBalance()" style="width:18px;height:18px;cursor:pointer">
            <label for="includeOldBalanceCheckbox" id="includeOldBalanceLabel" style="cursor:pointer;margin:0;font-size:13px">تضمين هذا الرصيد في الفاتورة الحالية</label>
          </div>
          <input type="hidden" id="invoiceOldBalance" value="0">
          <input type="hidden" id="invoiceOldBalanceType" value="none">
          <input type="hidden" id="invoiceOldBalanceDate" value="">
        </div>

        <div class="v3-sec">
          <div class="v3-sec-head"><label class="v3-lab">2) الأصناف</label>
            <button type="button" class="v3-link" onclick="inv2ToggleNew()"><i class="fas fa-plus"></i> صنف جديد مش في المخزن</button></div>
          <div class="v3-search"><i class="fas fa-search"></i>
            <input type="text" id="inv2Search" autocomplete="off" placeholder="ابحث عن صنف بالاسم أو الكود ثم اضغط عليه لإضافته…"
              oninput="inv2Search()" onfocus="inv2Search()" onblur="setTimeout(()=>{let r=document.getElementById('inv2Results');if(r)r.style.display='none'},180)" onkeydown="inv2SearchKey(event)">
            <div class="v3-results" id="inv2Results"></div></div>
          <div class="v3-newprod" id="inv2NewProd">
            <div class="g">
              <div><label>اسم الصنف الجديد</label><input class="v3-in" id="inv2NpName" placeholder="مثال: رأس طباعة"></div>
              <div><label>سعر البيع</label><input class="v3-in" type="number" id="inv2NpPrice" min="0" placeholder="0"></div>
              <div><label>الوحدة</label><select class="v3-in" id="inv2NpUnit"><option>قطعة</option><option>لتر</option><option>لفة</option><option>علبة</option><option>كيلو</option><option>متر</option></select></div>
              <div><label>المتوفر بالمخزن</label><input class="v3-in" type="number" id="inv2NpStock" min="0" value="10"></div>
            </div>
            <div style="margin-top:10px;display:flex;gap:8px"><button type="button" class="v3-btn green sm" onclick="inv2SaveNew()"><i class="fas fa-check"></i> حفظ في المخزن وإضافته للفاتورة</button>
              <button type="button" class="v3-btn gray sm" onclick="inv2ToggleNew(false)">إلغاء</button></div>
          </div>
          <div class="v3-items-wrap">
            <table class="v3-items"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
              <tbody id="invoiceItemsBody"></tbody></table>
            <div class="v3-empty" id="inv2Empty"><i class="fas fa-box-open" style="font-size:22px;display:block;margin-bottom:6px"></i>لسه ماضفتش أي صنف — ابحث فوق واختار الصنف</div>
          </div>
        </div>

        <div class="v3-sec v3-two">
          <div class="box">
            <label class="v3-lab">خصم % (اختياري)</label>
            <input class="v3-in" type="number" id="invoiceDiscountPercent" value="0" min="0" max="100" oninput="calculateInvoiceTotal()">
            <label class="v3-lab" style="margin-top:12px">3) المدفوع الآن (كاش)</label>
            <input class="v3-in" type="number" id="invoicePaidAmountInput" value="0" oninput="handlePaidAmountManualEdit()" style="font-weight:700;font-size:15px">
            <div class="v3-chips"><button type="button" onclick="inv2PayFull()">دفع كامل</button><button type="button" onclick="inv2PayNone()">آجل (لم يدفع)</button></div>
            <div id="invoicePaymentStatusDisplay" style="margin-top:9px;font-size:13px;font-weight:700"></div>
          </div>
          <div class="v3-total"><span>الإجمالي المستحق على الفاتورة</span><h2 id="invoiceFinalTotalDisplay">0 ج.م</h2></div>
        </div>
      </div>
      <div class="v3-inv-foot">
        <button type="button" class="save" id="invoiceSubmitBtn" onclick="createNewInvoice(event)"><i class="fas fa-save"></i> حفظ وعرض الفاتورة</button>
        <button type="button" class="cancel" onclick="closeNewInvoiceModal()">إلغاء</button>
      </div>
    </div>`;
}

// صف صنف جديد في الفاتورة. الحقول الأساسية (inv-item-code / qty / price) نفس أسماء الكود القديم عشان الحفظ والتعديل يشتغلوا كما هم
window.addInvoiceItemRow = function (selectedCode = '', selectedQty = 1) {
    let tbody = document.getElementById('invoiceItemsBody');
    if (!tbody || !selectedCode) return null;
    let p = inventory.find(i => i.code === selectedCode);
    let tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="nm"><b>${esc(p ? p.name : selectedCode)}</b><small>${esc(selectedCode)}${p ? ' · متاح ' + p.qty + ' ' + esc(p.unit || '') : ''}</small>
            <input type="hidden" class="inv-item-code" value="${esc(selectedCode)}"></td>
        <td><div class="v3-step"><button type="button" onclick="inv2Step(this,1)">+</button>
            <input type="number" class="inv-item-qty" min="1" value="${selectedQty}" oninput="calculateInvoiceTotal()">
            <button type="button" onclick="inv2Step(this,-1)">−</button></div></td>
        <td><input type="number" class="inv-item-price" value="${p ? p.price : 0}" oninput="calculateInvoiceTotal()"></td>
        <td class="inv-item-total-cell">0 ج.م</td>
        <td><button type="button" class="v3-del" onclick="this.closest('tr').remove();calculateInvoiceTotal()"><i class="fas fa-trash"></i></button></td>`;
    tbody.appendChild(tr);
    calculateInvoiceTotal();
    return tr;
};
window.updateRowPrice = function () { calculateInvoiceTotal(); };
window.inv2Step = function (btn, d) {
    let inp = btn.parentNode.querySelector('.inv-item-qty');
    inp.value = Math.max(1, (Number(inp.value) || 1) + d);
    calculateInvoiceTotal();
};

let inv2Matches = [], inv2Active = 0;
window.inv2Search = function () {
    let inp = document.getElementById('inv2Search'), box = document.getElementById('inv2Results');
    if (!inp || !box) return;
    let q = inp.value.toLowerCase().trim();
    inv2Matches = inventory.map((p, i) => ({ p, i }))
        .filter(x => !q || (x.p.name || '').toLowerCase().includes(q) || (x.p.code || '').toLowerCase().includes(q)).slice(0, 40);
    inv2Active = 0;
    let html = inv2Matches.map((x, k) => `<div class="v3-res ${k === 0 ? 'act' : ''}" onmousedown="event.preventDefault();inv2Pick(${x.i})">
        <div>${esc(x.p.name)}<br><small>${esc(x.p.code)} · متاح ${x.p.qty} ${esc(x.p.unit || '')}</small></div><div class="pr">${fmt(x.p.price)} ج.م</div></div>`).join('');
    if (!inv2Matches.length) html = `<div class="v3-res" onmousedown="event.preventDefault();inv2ToggleNew(true,'${enc(inp.value.trim())}')"><div>مفيش صنف بالاسم ده — <b style="color:#0284c7">+ أضفه كصنف جديد</b></div></div>`;
    box.innerHTML = html; box.style.display = 'block';
};
window.inv2SearchKey = function (e) {
    let box = document.getElementById('inv2Results');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        inv2Active = Math.max(0, Math.min(inv2Matches.length - 1, inv2Active + (e.key === 'ArrowDown' ? 1 : -1)));
        box.querySelectorAll('.v3-res').forEach((el, k) => el.classList.toggle('act', k === inv2Active));
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (inv2Matches[inv2Active]) window.inv2Pick(inv2Matches[inv2Active].i);
    } else if (e.key === 'Escape') box.style.display = 'none';
};
window.inv2Pick = function (i) {
    let p = inventory[i];
    if (!p) return;
    let existing = Array.from(document.querySelectorAll('#invoiceItemsBody tr')).find(tr => tr.querySelector('.inv-item-code').value === p.code);
    if (existing) window.inv2Step(existing.querySelector('.v3-step button'), 1);
    else window.addInvoiceItemRow(p.code, 1);
    let inp = document.getElementById('inv2Search');
    inp.value = ''; document.getElementById('inv2Results').style.display = 'none'; inp.focus();
};
window.inv2ToggleNew = function (show, encName) {
    let box = document.getElementById('inv2NewProd');
    let open = (show === undefined) ? box.style.display === 'none' || !box.style.display : show;
    box.style.display = open ? 'block' : 'none';
    if (open) {
        if (encName) document.getElementById('inv2NpName').value = dec(encName);
        document.getElementById('inv2Results').style.display = 'none';
        setTimeout(() => document.getElementById('inv2NpName').focus(), 30);
    }
};
window.inv2SaveNew = function () {
    let name = document.getElementById('inv2NpName').value.trim();
    let price = Number(document.getElementById('inv2NpPrice').value);
    let stock = Number(document.getElementById('inv2NpStock').value) || 0;
    let unit = document.getElementById('inv2NpUnit').value;
    if (!name) { alert('اكتب اسم الصنف.'); return; }
    if (isNaN(price) || price < 0) { alert('اكتب سعر البيع.'); return; }
    if (inventory.some(p => (p.name || '').trim() === name) && !confirm('يوجد صنف بنفس الاسم في المخزن. هل تريد إضافة صنف جديد بنفس الاسم؟')) return;
    let code, n = Date.now() % 1000000;
    do { code = 'PR-' + (n++); } while (inventory.some(p => p.code === code));
    inventory.push({ code, name, qty: stock, unit, price });
    saveData(); renderInventory(); renderDashboard();
    window.addInvoiceItemRow(code, 1);
    ['inv2NpName', 'inv2NpPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('inv2NpStock').value = 10;
    window.inv2ToggleNew(false);
};
window.inv2PayFull = function () { invoicePaidManuallyEdited = false; calculateInvoiceTotal(); };
window.inv2PayNone = function () { document.getElementById('invoicePaidAmountInput').value = 0; window.handlePaidAmountManualEdit(); };
function inv2SyncEmpty() {
    let empty = document.getElementById('inv2Empty'), tb = document.getElementById('invoiceItemsBody');
    if (empty && tb) empty.style.display = tb.children.length ? 'none' : 'block';
}
// نلف الدوال الأصلية عشان نحدّث حالة "فاضي" ونصفّر البحث عند فتح فاتورة جديدة
(function () {
    let origCalc = window.calculateInvoiceTotal;
    window.calculateInvoiceTotal = function () { let r = origCalc.apply(this, arguments); inv2SyncEmpty(); return r; };
    let origNew = window.openNewInvoiceModal;
    window.openNewInvoiceModal = function () {
        origNew.apply(this, arguments);
        let s = document.getElementById('inv2Search'); if (s) s.value = '';
        window.inv2ToggleNew(false);
        inv2SyncEmpty();
    };
})();

// =====================================================================
// حقن المودالات (كشف الحساب + السداد) — مرة واحدة
// =====================================================================
function injectV3Modals() {
    if (document.getElementById('stmtModal')) return;
    let wrap = document.createElement('div');
    wrap.innerHTML = `
    <div id="stmtModal" class="modal" style="display:none"><div class="modal-content st-card">
        <div class="modal-header"><h2><i class="fas fa-file-invoice"></i> كشف حساب العميل</h2><span class="close-btn" onclick="closeStatement()">&times;</span></div>
        <div class="st-filters">
            <select id="stCustomer" class="v3-in" onchange="stChangeCustomer()" style="min-width:170px"></select>
            <label>من <input type="date" class="v3-in" id="stFrom" onchange="renderStatement()"></label>
            <label>إلى <input type="date" class="v3-in" id="stTo" onchange="renderStatement()"></label>
            <select id="stStatus" class="v3-in" onchange="renderStatement()">
                <option value="all">كل الفواتير</option><option value="unpaid">عليها متبقي</option>
                <option value="partial">سداد جزئي</option><option value="paid">مسددة بالكامل</option></select>
            <input type="search" class="v3-in" id="stSearch" placeholder="رقم فاتورة أو صنف…" oninput="renderStatement()">
            <button class="v3-btn gray sm" onclick="stClear()">مسح الفلتر</button>
        </div>
        <div class="modal-body" id="stBody"></div>
        <div class="modal-footer">
            <button class="v3-btn green" onclick="stPay()"><i class="fas fa-hand-holding-dollar"></i> تسجيل سداد</button>
            <button class="v3-btn wa" onclick="stWhats()"><i class="fab fa-whatsapp"></i> إرسال واتساب</button>
            <button class="v3-btn" onclick="stPrint()"><i class="fas fa-print"></i> طباعة / PDF</button>
            <button class="v3-btn gray" onclick="closeStatement()">إغلاق</button>
        </div></div></div>

    <div id="custPayModal" class="modal" style="display:none"><div class="modal-content cp-card">
        <div class="modal-header"><h2 id="cpTitle">سداد</h2><span class="close-btn" onclick="closeCustPay()">&times;</span></div>
        <div class="modal-body">
            <div class="cp-top"><div>إجمالي المستحق<b id="cpDue">0</b></div><div>عدد البنود غير المسددة<b id="cpCount">0</b></div></div>
            <div class="cp-modes"><button id="cpModeAuto" onclick="cpSetMode('auto')"><i class="fas fa-bolt"></i> سداد سريع (الأقدم أولاً)</button>
                <button id="cpModeManual" onclick="cpSetMode('manual')"><i class="fas fa-list-check"></i> أختار الفواتير بنفسي</button></div>
            <p id="cpHint" class="v3-muted" style="margin-bottom:8px"></p>
            <div id="cpAutoBox" style="display:flex;gap:8px"><input type="number" class="v3-in" id="cpAmount" min="0" placeholder="المبلغ المدفوع" oninput="cpRecalc()" style="flex:1;font-size:16px;font-weight:700">
                <button class="v3-btn gray" onclick="cpPayAll()">سداد الكل</button></div>
            <table class="cp-table"><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>الإجمالي</th><th>المتبقي</th><th>العمر</th><th>يُسدَّد الآن</th></tr></thead><tbody id="cpRows"></tbody></table>
            <div id="cpSummary" class="cp-sum"></div>
            <input type="text" class="v3-in" id="cpNote" placeholder="ملاحظة على الدفعة (اختياري)" style="width:100%;margin-top:10px">
        </div>
        <div class="modal-footer"><button class="v3-btn gray" onclick="closeCustPay()">إلغاء</button>
            <button class="v3-btn green" id="cpConfirm" onclick="cpConfirm()"><i class="fas fa-check"></i> تأكيد السداد وطباعة الإيصال</button></div>
    </div></div>`;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
}

// ---------- تشغيل ----------
injectV3Css();
injectInvoiceModalV2();
injectBackupCard();
