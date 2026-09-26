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
                infoBox.style.background = '#2c1414';
                infoBox.style.color = '#fca5a5';
                infoBox.style.border = '1px solid #7f1d1d';
                infoBox.innerHTML = `<i class="fas fa-triangle-exclamation"></i> هذا العميل عليه مبلغ سابق مستحق: ${netDebt.toLocaleString()} ج.م
                    <button type="button" onclick="closeCustomerOldBalanceFromInvoice('${val.replace(/'/g, "\\'")}')" style="float:left; background:#7f1d1d; color:#fecaca; border:1px solid #ef4444; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; font-weight:bold;"><i class="fas fa-xmark"></i> إقفال الحساب السابق</button>`;
                if(includeRow) includeRow.style.display = 'flex';
                if(label) label.innerText = 'إضافة هذا المبلغ (عليه) إلى إجمالي الفاتورة الحالية';
            } else if(netDebt < -0.001) {
                infoBox.style.background = '#0d2c22';
                infoBox.style.color = '#6ee7b7';
                infoBox.style.border = '1px solid #14532d';
                infoBox.innerHTML = `<i class="fas fa-circle-check"></i> هذا العميل له رصيد سابق: ${Math.abs(netDebt).toLocaleString()} ج.م
                    <button type="button" onclick="closeCustomerOldBalanceFromInvoice('${val.replace(/'/g, "\\'")}')" style="float:left; background:#14532d; color:#bbf7d0; border:1px solid #10b981; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; font-weight:bold;"><i class="fas fa-xmark"></i> إقفال الحساب السابق</button>`;
                if(includeRow) includeRow.style.display = 'flex';
                if(label) label.innerText = 'خصم هذا الرصيد (له) من إجمالي الفاتورة الحالية';
            } else {
                infoBox.style.background = '#0f172a';
                infoBox.style.color = '#94a3b8';
                infoBox.style.border = '1px solid #334155';
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
        statusBox.innerHTML = `<span style="color:#f87171;"><i class="fas fa-arrow-down"></i> سيتبقى عليه: ${diff.toLocaleString()} ج.م (يُسجَّل عليه في حساباته)</span>`;
    } else if(diff < -0.5) {
        statusBox.innerHTML = `<span style="color:#34d399;"><i class="fas fa-arrow-up"></i> دفع زيادة: ${Math.abs(diff).toLocaleString()} ج.م (تُخصم كرصيد له في حساباته)</span>`;
    } else {
        statusBox.innerHTML = `<span style="color:#34d399;"><i class="fas fa-circle-check"></i> تم السداد بالكامل، الحساب مضبوط.</span>`;
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
    input.style.cssText = 'width:100%; padding:8px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px; font-size:13px; box-sizing:border-box;';

    let list = document.createElement('div');
    list.style.cssText = 'display:none; position:absolute; z-index:80; top:100%; right:0; left:0; background:#0f172a; border:1px solid #334155; border-radius:4px; max-height:220px; overflow-y:auto; margin-top:2px; box-shadow:0 8px 20px rgba(0,0,0,0.45);';

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
            list.innerHTML = '<div style="padding:9px; color:#94a3b8; font-size:12.5px;">لا توجد نتائج مطابقة</div>';
        } else {
            matches.slice(0, 80).forEach(o => {
                let item = document.createElement('div');
                item.textContent = o.textContent;
                item.style.cssText = 'padding:9px 10px; cursor:pointer; font-size:13px; border-bottom:1px solid #1e293b; color:#e2e8f0;';
                item.onmousedown = (e) => {
                    e.preventDefault();
                    selectEl.value = o.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    input.value = o.textContent;
                    list.style.display = 'none';
                };
                item.onmouseenter = () => item.style.background = '#1e293b';
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
            infoBox.style.background = '#2c1414'; infoBox.style.color = '#fca5a5'; infoBox.style.border = '1px solid #7f1d1d';
            infoBox.innerHTML = `<i class="fas fa-triangle-exclamation"></i> هذه الفاتورة تتضمن رصيد سابق عليه: ${Number(inv.oldBalance).toLocaleString()} ج.م`;
            if(label) label.innerText = 'إضافة هذا المبلغ (عليه) إلى إجمالي الفاتورة الحالية';
        } else {
            infoBox.style.background = '#0d2c22'; infoBox.style.color = '#6ee7b7'; infoBox.style.border = '1px solid #14532d';
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
        invoices.forEach(otherInv => {
            if(otherInv !== currentInvoiceRef && otherInv.customerName === customerName && Number(otherInv.remaining || 0) !== 0) {
                otherInv.paid = Number(otherInv.total);
                otherInv.remaining = 0;
                otherInv.status = 'تم الدفع بالكامل (ضمن تسوية رصيد سابق)';
            }
        });
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

// ===================== دليل العملاء =====================
function renderCustomers() {
    let tbody = document.getElementById('customersTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';

    if(customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">لا يوجد عملاء مسجلين بعد</td></tr>`;
        return;
    }

    customers.forEach((c, index) => {
        let custInvoices = invoices.filter(i => i.customerName === c.name);
        let totalSales = custInvoices.reduce((sum, i) => sum + Number(i.total), 0);

        // نفس دالة الحساب المستخدمة في كشف الحساب وفي لوحة المؤشرات، عشان الأرقام تتطابق دايماً
        let netDebt = getCustomerNetDebt(c.name);

        let debtHtml;
        if(netDebt > 0) {
            debtHtml = `<span class="badge-danger"><i class="fas fa-arrow-down"></i> ${netDebt.toLocaleString()} ج.م</span>`;
        } else if(netDebt < 0) {
            debtHtml = `<span class="badge-success"><i class="fas fa-arrow-up"></i> له رصيد ${Math.abs(netDebt).toLocaleString()} ج.م</span>`;
        } else {
            debtHtml = `<span class="badge-neutral">لا يوجد</span>`;
        }

        let lastPurchase = custInvoices.length > 0 ? custInvoices[custInvoices.length - 1].date : '—';
        let encodedName = encodeURIComponent(c.name);

        tbody.innerHTML += `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.phone || 'غير مسجل'}</td>
                <td>${debtHtml}</td>
                <td><strong style="color: #0284c7;">${totalSales.toLocaleString()} ج.م</strong></td>
                <td>${lastPurchase}</td>
                <td>
                    <div class="row-actions">
                        <button onclick="generateCustomerReportEncoded('${encodedName}')" class="btn-action btn-view-sm" title="كشف حساب تفصيلي"><i class="fas fa-file-invoice"></i> كشف حساب</button>
                        <button onclick="openEditCustomerModal(${index})" class="btn-action btn-edit-sm" title="تعديل بيانات العميل"><i class="fas fa-edit"></i> تعديل</button>
                        <button onclick="deleteCustomer(${index})" class="btn-action btn-danger-sm" title="حذف العميل"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

// البحث في دليل العملاء (كان معطوباً - تم إصلاحه)
window.filterCustomers = function() {
    let query = document.getElementById('searchCustomers')?.value.toLowerCase().trim() || '';
    document.querySelectorAll('#customersTableBody tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
};

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

window.openCustomerAccountPrompt = function() {
    let menu = document.getElementById('reportMenuDropdown');
    if(menu) menu.style.display = 'none';

    let customerNames = [...new Set(invoices.map(inv => inv.customerName))].filter(Boolean);

    if(customerNames.length === 0) {
        alert('لا توجد فواتير أو عملاء مسجلين حالياً!');
        return;
    }

    let customerListStr = customerNames.map((name, index) => `${index + 1} - ${name}`).join('\n');
    let chosenIndex = prompt(`اختر رقم العميل المطلوب استخراج كشف حسابه:\n\n${customerListStr}`);

    if(!chosenIndex) return;
    let selectedCustomer = customerNames[Number(chosenIndex) - 1];

    if(!selectedCustomer) {
        alert('اختيار غير صحيح!');
        return;
    }

    window.generateCustomerReport(selectedCustomer);
};

// فك تشفير اسم العميل القادم من زر "كشف حساب" في جدول دليل العملاء
window.generateCustomerReportEncoded = function(encodedName) {
    window.generateCustomerReport(decodeURIComponent(encodedName));
};

// كشف حساب تفصيلي ودقيق 100% للعميل: كل فاتورة، كل دفعة، كل خصم، بالتواريخ،
// ورصيد افتتاحي لو موجود، وفي الآخر إجمالي واحد واضح مفيهوش أي ازدواج في الحساب
window.generateCustomerReport = function(customerName) {
    let cust = customers.find(c => c.name === customerName);
    let customerInvoices = invoices.filter(inv => inv.customerName === customerName);

    if(customerInvoices.length === 0 && (!cust || !cust.oldBalance)) {
        alert('لا توجد أي معاملات أو فواتير مسجلة لهذا العميل حتى الآن.');
        return;
    }

    let totalGrossPurchases = 0;   // إجمالي قيمة الأصناف قبل الخصم
    let totalDiscounts = 0;        // إجمالي الخصومات الممنوحة
    let totalInitialPaid = 0;      // المدفوع وقت إصدار كل فاتورة
    let totalLaterPayments = 0;    // دفعات لاحقة (سداد ديون متأخرة)
    let totalRemainingNow = 0;     // المتبقي الحالي على كل الفواتير

    let rowsHtml = '';

    customerInvoices.forEach(inv => {
        totalGrossPurchases += Number(inv.subtotal || inv.total || 0);
        totalDiscounts += Number(inv.discountAmount || 0);
        totalInitialPaid += Number(inv.paid || 0);
        totalRemainingNow += Number(inv.remaining || 0);

        let itemsSummary = (inv.items || []).map(it => `${it.name} × ${it.qty}`).join('، ') || '—';

        let oldBalNote = '';
        if(inv.oldBalance && Number(inv.oldBalance) > 0) {
            oldBalNote = inv.oldBalanceType === 'on_him'
                ? `<div style="color:#b45309; font-size:11.5px; margin-top:5px;"><i class="fas fa-clock-rotate-left"></i> شاملة حساب سابق كان عليه: ${Number(inv.oldBalance).toLocaleString()} ج.م (بتاريخ ${inv.oldBalanceDate || '—'})</div>`
                : `<div style="color:#0369a1; font-size:11.5px; margin-top:5px;"><i class="fas fa-clock-rotate-left"></i> بعد خصم رصيد كان له: ${Number(inv.oldBalance).toLocaleString()} ج.م (بتاريخ ${inv.oldBalanceDate || '—'})</div>`;
        }

        let remainingColor = Number(inv.remaining || 0) > 0 ? '#e11d48' : '#10b981';
        let remainingLabel = Number(inv.remaining || 0) > 0 ? `${Number(inv.remaining).toLocaleString()} ج.م` : 'مسدد بالكامل';

        // لو لسه فيه متبقي على الفاتورة، نحسب عدد الأيام اللي فاتت من تاريخ إصدارها (عمر الدين)
        let agingNote = '';
        if(Number(inv.remaining || 0) > 0 && inv.dateISO) {
            let ageDays = daysBetweenISO(inv.dateISO, new Date().toISOString());
            if(ageDays !== null) {
                agingNote = `<div style="color:#e11d48; font-size:11.5px; margin-top:4px;"><i class="fas fa-hourglass-half"></i> متأخر عن السداد منذ ${ageDays} يوم</div>`;
            }
        }

        rowsHtml += `
            <tr>
                <td style="text-align:center; font-weight:bold;">${inv.id}</td>
                <td style="text-align:center; white-space:nowrap;">${inv.date}</td>
                <td style="text-align:right; font-size:12.5px;">${itemsSummary}${oldBalNote}</td>
                <td style="text-align:center;">${Number(inv.total).toLocaleString()} ج.م</td>
                <td style="text-align:center; color:#10b981;">${Number(inv.paid || 0).toLocaleString()} ج.م</td>
                <td style="text-align:center; color:${remainingColor}; font-weight:bold;">${remainingLabel}${agingNote}</td>
            </tr>
        `;

        if(inv.paymentHistory && inv.paymentHistory.length > 0) {
            inv.paymentHistory.forEach(p => {
                totalLaterPayments += Number(p.amount || 0);
                let lateDaysNote = '';
                if(p.dateISO && inv.dateISO) {
                    let lateDays = daysBetweenISO(inv.dateISO, p.dateISO);
                    if(lateDays !== null) {
                        lateDaysNote = lateDays > 0
                            ? ` <span style="color:#b45309;">(بعد ${lateDays} يوم من تاريخ الفاتورة)</span>`
                            : ` <span style="color:#059669;">(بنفس يوم الفاتورة)</span>`;
                    }
                }
                rowsHtml += `
                    <tr>
                        <td colspan="6" style="background:#f0fdf4; color:#166534; font-size:12.5px; text-align:right; padding:8px 14px;">
                            <i class="fas fa-hand-holding-dollar"></i>
                            &nbsp;دفعة سداد لاحقة على فاتورة ${inv.id} بتاريخ <strong>${p.date}</strong>: <strong>${Number(p.amount).toLocaleString()} ج.م</strong>${lateDaysNote}
                            ${p.note ? ' — ' + p.note : ''}
                        </td>
                    </tr>
                `;
            });
        }
    });

    // رصيد افتتاحي مستقل (لسه معلق ومش داخل أي فاتورة حالياً)
    let standaloneOldBalance = 0;
    let standaloneRowHtml = '';
    if(cust && cust.oldBalance && Number(cust.oldBalance) > 0 && cust.balanceType !== 'none') {
        standaloneOldBalance = cust.balanceType === 'on_him' ? Number(cust.oldBalance) : -Number(cust.oldBalance);
        let label = cust.balanceType === 'on_him' ? 'رصيد افتتاحي عليه (لسه مش مرتبط بفاتورة)' : 'رصيد افتتاحي له (لسه مش مرتبط بفاتورة)';
        let color = cust.balanceType === 'on_him' ? '#e11d48' : '#0284c7';
        standaloneRowHtml = `
            <tr>
                <td colspan="3" style="text-align:right; font-weight:bold; color:${color};"><i class="fas fa-circle-exclamation"></i> ${label}</td>
                <td colspan="3" style="text-align:center; font-weight:bold; color:${color};">${Number(cust.oldBalance).toLocaleString()} ج.م ${cust.oldBalanceDate ? '(' + cust.oldBalanceDate + ')' : ''}</td>
            </tr>
        `;
    }

    let totalPaidAll = totalInitialPaid + totalLaterPayments;
    // نفس دالة الحساب المستخدمة بالضبط في دليل العملاء ولوحة المؤشرات، عشان الرقم يتطابق 100% في كل مكان
    let netDebtNow = getCustomerNetDebt(customerName);

    let netDebtHtml = netDebtNow > 0
        ? `<span style="color:#e11d48;"><i class="fas fa-arrow-down"></i> مطلوب منه: ${netDebtNow.toLocaleString()} ج.م</span>`
        : netDebtNow < 0
            ? `<span style="color:#059669;"><i class="fas fa-arrow-up"></i> رصيد له: ${Math.abs(netDebtNow).toLocaleString()} ج.م</span>`
            : `<span style="color:#059669;"><i class="fas fa-circle-check"></i> الحساب مسدد بالكامل</span>`;

    let reportWin = window.open('', '_blank', 'height=750,width=980');
    reportWin.document.write(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>كشف حساب عميل: ${customerName} - Bro Tech</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body { font-family: Tahoma, sans-serif; padding: 25px; background: #fff; color: #1e293b; direction: rtl; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #cbd5e1; padding: 9px; font-size: 13px; }
                th { background: #0f172a; color: #fff; }
                .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
                .summary-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
                .summary-item span.label { display:block; font-size:11.5px; color:#64748b; margin-bottom:4px; }
                .summary-item span.value { font-size: 16px; font-weight: bold; }
                .final-box { background: #0f172a; color: #fff; border-radius: 10px; padding: 16px; text-align: center; margin: 22px 0; font-size: 18px; font-weight: bold; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 3px solid #0284c7; padding-bottom: 14px;">
                <h1 style="color: #0284c7; margin: 0; font-size: 22px;">Bro Tech - كشف حساب عميل تفصيلي</h1>
                <p style="font-size: 16px; margin: 8px 0 0; color: #334155;">اسم العميل: <strong>${customerName}</strong></p>
                <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0;">تاريخ إصدار الكشف: ${new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            <div class="summary-grid">
                <div class="summary-item"><span class="label">إجمالي المشتريات (قبل الخصم)</span><span class="value" style="color:#0284c7;">${totalGrossPurchases.toLocaleString()} ج.م</span></div>
                <div class="summary-item"><span class="label">إجمالي الخصومات</span><span class="value" style="color:#f59e0b;">${totalDiscounts.toLocaleString()} ج.م</span></div>
                <div class="summary-item"><span class="label">إجمالي المدفوع (كل الدفعات)</span><span class="value" style="color:#10b981;">${totalPaidAll.toLocaleString()} ج.م</span></div>
                <div class="summary-item"><span class="label">عدد الفواتير</span><span class="value" style="color:#334155;">${customerInvoices.length}</span></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>رقم الفاتورة</th>
                        <th>التاريخ</th>
                        <th>الأصناف المشتراة</th>
                        <th>إجمالي الفاتورة</th>
                        <th>المدفوع وقتها</th>
                        <th>المتبقي حالياً</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    ${standaloneRowHtml}
                </tbody>
            </table>

            <div class="final-box">
                الإجمالي النهائي لحساب العميل الآن: ${netDebtHtml}
            </div>

            <div class="no-print" style="margin-top: 15px; text-align: center;">
                <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 10px 22px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size:14px;"><i class="fas fa-print"></i> طباعة كشف الحساب / حفظ PDF</button>
            </div>
        </body>
        </html>
    `);
    reportWin.document.close();
};

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
