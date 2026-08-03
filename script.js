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

// Data State (Initial Defaults)
let inventory = [
    { code: 'PR-001', name: 'حبر طابعة ياباني أسود ليزر', qty: 45, unit: 'لتر', price: 1200 },
    { code: 'PR-002', name: 'ماكينة طباعة رقمية موديل X', qty: 5, unit: 'قطعة', price: 25000 },
    { code: 'PR-003', name: 'رول استيكر حراري عالي الجودة', qty: 120, unit: 'لفة', price: 150 }
];

let customers = [
    { name: 'شركة النور للاستيراد', phone: '01012345678', address: 'القاهرة' },
    { name: 'مؤسسة الهلال التجارية', phone: '01098765432', address: 'الجيزة' }
];

let invoices = [];
let purchases = [];

let settings = {
    companyName: 'شركة برو تيك للأحبار وماكينات الطباعة - ProTech',
    owner: 'وائل غنيم',
    whatsapp: '01020008299',
    whatsappNabawy: '01092201111',
    address: 'جمهورية مصر العربية - مدينة بدر'
};

let currentInvoiceData = null;
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
            if(data.settings) settings = data.settings;
        } else {
            await saveDataToFirebase();
        }
    } catch (error) {
        console.error("Error loading from Firebase, falling back to localStorage:", error);
        inventory = JSON.parse(localStorage.getItem('protech_inventory')) || inventory;
        customers = JSON.parse(localStorage.getItem('protech_customers')) || customers;
        invoices = JSON.parse(localStorage.getItem('protech_invoices')) || invoices;
        purchases = JSON.parse(localStorage.getItem('protech_purchases')) || purchases;
        settings = JSON.parse(localStorage.getItem('protech_settings')) || settings;
    }
}

async function saveDataToFirebase() {
    try {
        await setDoc(doc(db, "protech_data", "main_store"), {
            inventory,
            customers,
            invoices,
            purchases,
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
}

// Global functions attached to window so HTML onclick works correctly
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-links li').forEach(el => el.classList.remove('active'));
    
    let targetTab = document.getElementById('tab-' + tabId);
    if(targetTab) targetTab.classList.add('active');
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
};

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
            <div class="stat-info">
                <h3>إجمالي الربح</h3>
                <p id="statTotalProfit" style="font-size: 20px; font-weight: bold; color: #10b981; margin: 5px 0 0 0;">0 ج.م</p>
            </div>
            <div class="stat-icon" style="background: #10b981; color: #fff; padding: 15px; border-radius: 8px;"><i class="fas fa-chart-line"></i></div>
        `;
        statsGrid.appendChild(profitCard);
    }
    let profitElem = document.getElementById('statTotalProfit');
    if(profitElem) {
        profitElem.innerText = totalProfit.toLocaleString() + ' ج.م';
    }

    let recentTbody = document.querySelector('#recentInvoicesTable tbody');
    if(recentTbody) {
        recentTbody.innerHTML = '';
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
        let lowItems = inventory.filter(i => i.qty < 10);
        if(lowItems.length === 0) {
            alertsList.innerHTML = '<p style="color:#10b981; font-size:14px;"><i class="fas fa-check-circle"></i> جميع الأصناف في المخزون متوفرة.</p>';
        } else {
            lowItems.forEach(i => {
                alertsList.innerHTML += `<div class="alert-item"><span>${i.name}</span> <span class="badge-danger">متبقي: ${i.qty} ${i.unit}</span></div>`;
            });
        }
    }
}

function renderInventory() {
    let tbody = document.getElementById('inventoryTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    inventory.forEach((item, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${item.code}</td>
                <td>${item.name}</td>
                <td><strong>${item.qty}</strong></td>
                <td>${item.unit}</td>
                <td>${item.price.toLocaleString()} ج.م</td>
                <td>
                    <button class="btn-primary-sm" onclick="openEditProductModal(${index})" style="background: #0284c7; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-left: 5px;"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn-danger-sm" onclick="deleteProduct(${index})" style="background: #f43f5e; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

window.filterInventory = function() {
    let searchInput = document.getElementById('searchInventory');
    if(!searchInput) return;
    let query = searchInput.value.toLowerCase();
    let rows = document.querySelectorAll('#inventoryTableBody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
};

window.openAddProductModal = function() { 
    let modal = document.getElementById('addProductModal');
    if(modal) modal.style.display = 'flex'; 
};

window.closeAddProductModal = function() { 
    let modal = document.getElementById('addProductModal');
    if(modal) modal.style.display = 'none'; 
};

window.addNewProduct = function(e) {
    if(e) e.preventDefault();
    let code = document.getElementById('prodCode')?.value;
    let name = document.getElementById('prodName')?.value;
    let qty = Number(document.getElementById('prodQty')?.value);
    let unit = document.getElementById('prodUnit')?.value;
    let price = Number(document.getElementById('prodPrice')?.value);

    if(!code || !name) return;

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

function renderPurchases() {
    let tbody = document.getElementById('purchasesTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    purchases.forEach((p, index) => {
        tbody.innerHTML += `
            <tr>
                <td>PO-${1000 + index}</td>
                <td>${p.supplier}</td>
                <td>${p.productName}</td>
                <td><span style="color: #10b981; font-weight: bold;">+${p.qty}</span></td>
                <td>${(p.unitCost || 0).toLocaleString()} ج.م</td>
                <td>${p.cost.toLocaleString()} ج.م</td>
                <td>${p.date}</td>
                <td>
                    <button class="btn-danger-sm" onclick="deletePurchase(${index})"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

window.openNewPurchaseModal = function() { 
    let modal = document.getElementById('newPurchaseModal');
    if(modal) modal.style.display = 'flex'; 
};

window.closeNewPurchaseModal = function() { 
    let modal = document.getElementById('newPurchaseModal');
    if(modal) modal.style.display = 'none'; 
};

window.createNewPurchase = function(e) {
    if(e) e.preventDefault();
    let supplier = document.getElementById('purchaseSupplier')?.value;
    let prodCode = document.getElementById('purchaseProductSelect')?.value;
    let qty = Number(document.getElementById('purchaseQty')?.value);
    let unitCost = Number(document.getElementById('purchaseUnitCost')?.value || document.getElementById('purchaseCost')?.value);
    let totalCost = unitCost * qty;

    let product = inventory.find(i => i.code === prodCode);
    if(product) {
        product.qty += qty;
        purchases.push({
            supplier,
            productCode: prodCode,
            productName: product.name,
            qty,
            unitCost,
            cost: totalCost,
            date: new Date().toLocaleDateString('ar-EG')
        });
        saveData();
        refreshAllData();
        window.closeNewPurchaseModal();
        if(e && e.target) e.target.reset();
        alert('تم تسجيل الشراء وزيادة المخزون بنجاح!');
    }
};

window.deletePurchase = function(index) {
    if(confirm('هل تريد حذف عملية الشراء هذه؟ (سيتم خصم الكمية المضافة من المخزون).')) {
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

function populateSelects() {
    let custSelect = document.getElementById('invoiceCustomerSelect');
    if(custSelect) {
        custSelect.innerHTML = '<option value="">-- اختر عميل مسجل --</option>';
        customers.forEach(c => {
            custSelect.innerHTML += `<option value="${c.name}">${c.name} (${c.phone})</option>`;
        });
        custSelect.innerHTML += `<option value="NEW_CUSTOMER" style="color: #0284c7; font-weight: bold;">+ إضافة عميل جديد...</option>`;
    }

    let prodSelect = document.getElementById('invoiceProductSelect');
    if(prodSelect) {
        prodSelect.innerHTML = '';
        inventory.forEach(i => {
            prodSelect.innerHTML += `<option value="${i.code}" data-price="${i.price}" data-qty="${i.qty}">${i.name} (المتاح: ${i.qty} ${i.unit} - ${i.price} ج.م)</option>`;
        });
        window.updateMaxQuantity();
    }

    let purProdSelect = document.getElementById('purchaseProductSelect');
    if(purProdSelect) {
        purProdSelect.innerHTML = '';
        inventory.forEach(i => {
            purProdSelect.innerHTML += `<option value="${i.code}">${i.name}</option>`;
        });
    }
}

window.handleCustomerSelectChange = function() {
    let val = document.getElementById('invoiceCustomerSelect')?.value;
    let newDiv = document.getElementById('newCustomerDiv');
    if(newDiv) {
        newDiv.style.display = (val === 'NEW_CUSTOMER') ? 'block' : 'none';
    }
};

window.addInvoiceItemRow = function() {
    let tbody = document.getElementById('invoiceItemsBody');
    if(!tbody) return;
    
    let optionsHtml = '';
    inventory.forEach(i => {
        optionsHtml += `<option value="${i.code}" data-price="${i.price}" data-qty="${i.qty}">${i.name} (المتاح: ${i.qty})</option>`;
    });

    let tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="padding: 5px;"><select class="inv-item-code" style="width:100%; padding:6px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;" onchange="updateRowPrice(this)">${optionsHtml}</select></td>
        <td style="padding: 5px;"><input type="number" class="inv-item-qty" value="1" min="1" style="width:100%; padding:6px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px; text-align:center;" oninput="calculateInvoiceTotal()"></td>
        <td style="padding: 5px;"><input type="number" class="inv-item-price" value="0" style="width:100%; padding:6px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px; text-align:center;" oninput="calculateInvoiceTotal()"></td>
        <td style="padding: 5px; text-align: center;"><button type="button" onclick="this.closest('tr').remove(); calculateInvoiceTotal();" style="background:#f43f5e; color:#fff; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;"><i class="fas fa-trash"></i></button></td>
    `;
    tbody.appendChild(tr);
    updateRowPrice(tr.querySelector('.inv-item-code'));
};

window.updateRowPrice = function(selectElem) {
    let opt = selectElem.options[selectElem.selectedIndex];
    let price = opt ? opt.getAttribute('data-price') : 0;
    let tr = selectElem.closest('tr');
    let priceInput = tr.querySelector('.inv-item-price');
    if(priceInput) priceInput.value = price;
    calculateInvoiceTotal();
};

window.calculateInvoiceTotal = function() {
    let rows = document.querySelectorAll('#invoiceItemsBody tr');
    let subtotal = 0;

    rows.forEach(tr => {
        let qty = Number(tr.querySelector('.inv-item-qty')?.value) || 0;
        let price = Number(tr.querySelector('.inv-item-price')?.value) || 0;
        subtotal += (qty * price);
    });

    let oldBalance = Number(document.getElementById('invoiceOldBalance')?.value) || 0;
    let oldBalanceType = document.getElementById('invoiceOldBalanceType')?.value;
    let discountPercent = Number(document.getElementById('invoiceDiscountPercent')?.value) || 0;

    let discountAmount = (subtotal * discountPercent) / 100;
    let netAfterDiscount = subtotal - discountAmount;

    let finalTotal = netAfterDiscount;
    if(oldBalanceType === 'on_him') {
        finalTotal += oldBalance;
    } else {
        finalTotal -= oldBalance;
    }

    let display = document.getElementById('invoiceFinalTotalDisplay');
    if(display) display.innerText = finalTotal.toLocaleString() + ' ج.م';
    
    return finalTotal;
};

window.openNewInvoiceModal = function() {
    let modal = document.getElementById('newInvoiceModal');
    if(modal) modal.style.display = 'flex';
    populateSelects();
    
    // تصفير الجدول وإضافة صف افتراضي أول
    let tbody = document.getElementById('invoiceItemsBody');
    if(tbody) {
        tbody.innerHTML = '';
        window.addInvoiceItemRow();
    }
    let disc = document.getElementById('invoiceDiscountPercent');
    if(disc) disc.value = 0;
    let oldBal = document.getElementById('invoiceOldBalance');
    if(oldBal) oldBal.value = 0;
    calculateInvoiceTotal();
};

window.closeNewInvoiceModal = function() { 
    let modal = document.getElementById('newInvoiceModal');
    if(modal) modal.style.display = 'none'; 
};
window.createNewInvoice = function(e) {
    if(e) e.preventDefault();
    
    let customerSelectVal = document.getElementById('invoiceCustomerSelect')?.value;
    let customerName = customerSelectVal;
    let customerPhone = '';
    let customerAddress = '';

    if(customerSelectVal === 'NEW_CUSTOMER') {
        customerName = document.getElementById('newCustomerName')?.value.trim();
        customerPhone = document.getElementById('newCustomerPhone')?.value.trim();
        customerAddress = document.getElementById('newCustomerAddress')?.value.trim();
        if(customerName) {
            customers.push({ name: customerName, phone: customerPhone, address: customerAddress });
        }
    } else {
        let foundCust = customers.find(c => c.name === customerSelectVal);
        if(foundCust) {
            customerPhone = foundCust.phone;
            customerAddress = foundCust.address;
        }
    }

    let rows = document.querySelectorAll('#invoiceItemsBody tr');
    if(rows.length === 0) {
        alert('يجب إضافة صنف واحد على الأقل للفاتورة!');
        return;
    }

    let items = [];
    let subtotal = 0;

    for(let tr of rows) {
        let prodCode = tr.querySelector('.inv-item-code').value;
        let opt = tr.querySelector('.inv-item-code').selectedOptions[0];
        let productName = opt ? opt.text.split(' (')[0] : '';
        let qty = Number(tr.querySelector('.inv-item-qty').value);
        let price = Number(tr.querySelector('.inv-item-price').value);
        let availableQty = Number(opt.getAttribute('data-qty'));

        if(qty > availableQty) {
            alert(`الكمية المطلوبة للصنف (${productName}) أكبر من المتاح في المخزون!`);
            return;
        }

        let itemTotal = qty * price;
        subtotal += itemTotal;
        items.push({ code: prodCode, name: productName, qty, price, total: itemTotal });
    }

    let discountPercent = Number(document.getElementById('invoiceDiscountPercent')?.value) || 0;
    let discountAmount = (subtotal * discountPercent) / 100;
    let netAfterDiscount = subtotal - discountAmount;

    let oldBalance = Number(document.getElementById('invoiceOldBalance')?.value) || 0;
    let oldBalanceType = document.getElementById('invoiceOldBalanceType')?.value;
    let finalTotal = netAfterDiscount;
    if(oldBalanceType === 'on_him') finalTotal += oldBalance;
    else finalTotal -= oldBalance;

    let paymentStatus = document.getElementById('invoicePaymentStatus')?.value;
    let paidAmount = finalTotal;
    let remainingAmount = 0;

    if(paymentStatus === 'لم يدفع') {
        remainingAmount = Number(document.getElementById('invoiceRemainingInput')?.value) || 0;
        paidAmount = finalTotal - remainingAmount;
        if(paidAmount < 0) paidAmount = 0;
    }

    // خصم الكميات من المخزون
    items.forEach(item => {
        let prodObj = inventory.find(i => i.code === item.code);
        if(prodObj) {
            prodObj.qty -= item.qty;
        }
    });

    let invoiceId = 'INV-' + Math.floor(1000 + Math.random() * 9000);
    let currentDate = new Date().toLocaleDateString('ar-EG');

    let newInv = {
        id: invoiceId,
        customerName,
        customerPhone,
        customerAddress,
        items,
        subtotal,
        discountPercent,
        oldBalance,
        oldBalanceType,
        total: finalTotal,
        paid: paidAmount,
        remaining: remainingAmount,
        status: paymentStatus === 'لم يدفع' && remainingAmount > 0 ? `متبقي: ${remainingAmount} ج.م` : paymentStatus,
        date: currentDate
    };

    invoices.push(newInv);
    saveData();
    refreshAllData();
    window.closeNewInvoiceModal();
    window.showInvoiceModal(newInv);
};


    if(customerSelectVal === 'NEW_CUSTOMER') {
        customerName = document.getElementById('newCustomerName')?.value.trim();
        customerPhone = document.getElementById('newCustomerPhone')?.value.trim();
        customerAddress = document.getElementById('newCustomerAddress')?.value.trim();
        if(customerName) {
            customers.push({ name: customerName, phone: customerPhone, address: customerAddress });
        }
    } else {
        let foundCust = customers.find(c => c.name === customerSelectVal);
        if(foundCust) {
            customerPhone = foundCust.phone;
            customerAddress = foundCust.address;
        }
    }

    let prodSelect = document.getElementById('invoiceProductSelect');
    if(!prodSelect) return;
    let prodCode = prodSelect.value;
    let opt = prodSelect.options[prodSelect.selectedIndex];
    let productName = opt.text.split(' (')[0];
    let unitPrice = Number(opt.getAttribute('data-price'));
    let qty = Number(document.getElementById('invoiceQty')?.value);
    let availableQty = Number(opt.getAttribute('data-qty'));

    if(qty > availableQty) {
        alert('الكمية المطلوبة أكبر من المتاح في المخزون!');
        return;
    }

    let totalAmount = unitPrice * qty;

    let paymentStatus = document.getElementById('invoicePaymentStatus')?.value;
    let paidAmount = totalAmount;
    let remainingAmount = 0;

    if(paymentStatus === 'لم يدفع') {
        remainingAmount = Number(document.getElementById('invoiceRemainingInput')?.value) || 0;
        paidAmount = totalAmount - remainingAmount;
        if(paidAmount < 0) paidAmount = 0;
    }

    let prodObj = inventory.find(i => i.code === prodCode);
    if(prodObj) {
        prodObj.qty -= qty;
    }

    let invoiceId = 'INV-' + Math.floor(1000 + Math.random() * 9000);
    let currentDate = new Date().toLocaleDateString('ar-EG');

    let newInv = {
        id: invoiceId,
        customerName,
        customerPhone,
        customerAddress,
        items: [{ name: productName, qty, price: unitPrice, total: totalAmount }],
        total: totalAmount,
        paid: paidAmount,
        remaining: remainingAmount,
        status: paymentStatus === 'لم يدفع' && remainingAmount > 0 ? `متبقي: ${remainingAmount} ج.م` : paymentStatus,
        date: currentDate
    };

    invoices.push(newInv);
    saveData();
    refreshAllData();
    window.closeNewInvoiceModal();
    window.showInvoiceModal(newInv);
};

function renderInvoices() {
    let tbody = document.getElementById('invoicesTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    invoices.slice().reverse().forEach(inv => {
        let statusBadge = (inv.remaining > 0) 
            ? `<span class="badge-danger">متبقي: ${inv.remaining} ج.م</span>` 
            : '<span class="badge-success">تم الدفع بالكامل</span>';
        
        let invString = encodeURIComponent(JSON.stringify(inv));
        tbody.innerHTML += `
            <tr>
                <td><strong>${inv.id}</strong></td>
                <td>${inv.customerName}</td>
                <td>${inv.date}</td>
                <td>${inv.total.toLocaleString()} ج.م</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-primary-sm" onclick='showInvoiceModalEncoded("${invString}")'><i class="fas fa-eye"></i> معاينة</button>
                    <button class="btn-danger-sm" onclick="deleteInvoice('${inv.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.filterInvoices = function() {
    let searchInput = document.getElementById('searchInvoices');
    if(!searchInput) return;
    let query = searchInput.value.toLowerCase();
    let rows = document.querySelectorAll('#invoicesTableBody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
};

window.deleteInvoice = function(id) {
    if(confirm('هل تريد حذف هذه الفاتورة؟')) {
        invoices = invoices.filter(i => i.id !== id);
        saveData();
        refreshAllData();
    }
};

function renderCustomers() {
    let tbody = document.getElementById('customersTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    customers.forEach((c, index) => {
        let custInvoices = invoices.filter(i => i.customerName === c.name);
        let totalSpent = custInvoices.reduce((sum, i) => sum + i.total, 0);
        let totalRemaining = custInvoices.reduce((sum, i) => sum + (i.remaining || 0), 0);

        let statusText = totalRemaining > 0 
            ? `<span style="color: #f43f5e; font-weight: bold;">عليه متبقي: ${totalRemaining} ج.م</span>` 
            : `<span style="color: #10b981;">الحساب خالص</span>`;

        tbody.innerHTML += `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.phone || 'غير مسجل'}</td>
                <td>${statusText}</td>
                <td>${custInvoices.length} فواتير</td>
                <td>
                    ${totalSpent.toLocaleString()} ج.م
                    <button class="btn-danger-sm" onclick="deleteCustomer(${index})" style="margin-right: 10px;"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

window.openAddCustomerModal = function() { 
    let modal = document.getElementById('addCustomerModal');
    if(modal) modal.style.display = 'flex'; 
};

window.closeAddCustomerModal = function() { 
    let modal = document.getElementById('addCustomerModal');
    if(modal) modal.style.display = 'none'; 
};

window.addNewCustomerDirect = function(e) {
    if(e) e.preventDefault();
    let name = document.getElementById('custName')?.value.trim();
    let phone = document.getElementById('custPhone')?.value.trim();
    let address = document.getElementById('custAddress')?.value.trim();

    if(!name) return;
    if(customers.some(c => c.name === name)) {
        alert('هذا العميل مسجل مسبقاً!');
        return;
    }

    customers.push({ name, phone, address });
    saveData();
    refreshAllData();
    window.closeAddCustomerModal();
    if(e && e.target) e.target.reset();
    alert('تم حفظ العميل بنجاح!');
};

window.deleteCustomer = function(index) {
    if(confirm('هل أنت متأكد من حذف هذا العميل من الدليل؟')) {
        customers.splice(index, 1);
        saveData();
        refreshAllData();
    }
};

window.showInvoiceModalEncoded = function(encodedInv) {
    let inv = JSON.parse(decodeURIComponent(encodedInv));
    window.showInvoiceModal(inv);
};

window.showInvoiceModal = function(inv) {
    currentInvoiceData = inv;
    let area = document.getElementById('printableInvoiceArea');
    if(!area) return;
    
    let itemsHtml = '';
    if(inv.items) {
        inv.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.name}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.qty}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.price.toLocaleString()} ج.م</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${item.total.toLocaleString()} ج.م</td>
                </tr>
            `;
        });
    }

    area.innerHTML = `
        <div style="background: #fff; color: #000; padding: 25px; font-family: Tahoma, sans-serif; direction: rtl; text-align: right;">
            <div style="border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h3 style="margin: 0; color: #0284c7; font-size: 18px;">${settings.companyName}</h3>
                    <div>
                        <h4 style="margin: 0; font-size: 16px;">فاتورة مبيعات</h4>
                        <p style="margin: 2px 0 0 0; font-size: 12px; text-align: left;">رقم: ${inv.id}</p>
                        <p style="margin: 2px 0 0 0; font-size: 12px; text-align: left;">التاريخ: ${inv.date}</p>
                    </div>
                </div>
            </div>

            <div style="background: #f1f5f9; padding: 10px; margin-bottom: 15px; font-size: 13px; border-radius: 4px;">
                <strong>العميل:</strong> ${inv.customerName} | <strong>الهاتف:</strong> ${inv.customerPhone || '-'}
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
                <thead>
                    <tr style="background: #e2e8f0;">
                        <th style="padding: 8px; text-align: right;">الصنف</th>
                        <th style="padding: 8px; text-align: center;">الكمية</th>
                        <th style="padding: 8px; text-align: center;">السعر</th>
                        <th style="padding: 8px; text-align: left;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <div style="font-size: 13px; border-top: 1px solid #ccc; padding-top: 10px; text-align: left;">
                <p style="margin: 3px 0;">إجمالي الأصناف: ${(inv.subtotal || inv.total).toLocaleString()} ج.م</p>
                ${inv.discountPercent ? `<p style="margin: 3px 0; color: #10b981;">خصم (${inv.discountPercent}%): -${((inv.subtotal * inv.discountPercent)/100).toLocaleString()} ج.م</p>` : ''}
                ${inv.oldBalance ? `<p style="margin: 3px 0;">حساب سابق: ${inv.oldBalance.toLocaleString()} ج.م</p>` : ''}
                <p style="margin: 5px 0; font-size: 15px; font-weight: bold; color: #0284c7;">الإجمالي النهائي: ${inv.total.toLocaleString()} ج.م</p>
                <p style="margin: 3px 0;">المدفوع: ${(inv.paid || 0).toLocaleString()} ج.م</p>
                <p style="margin: 3px 0; color: #e11d48;">المتبقي: ${(inv.remaining || 0).toLocaleString()} ج.م</p>
            </div>
        </div>
        <div style="text-align: center; margin-top: 15px;">
            <button onclick="sendToWhatsAppNabawy()" style="background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fab fa-whatsapp"></i> إرسال لمحمد النبوي</button>
        </div>
    `;
    let modal = document.getElementById('invoiceModal');
    if(modal) modal.style.display = 'flex';
};

    area.innerHTML = `
        <div style="background: #fff; color: #000; padding: 25px; font-family: Tahoma, sans-serif; direction: rtl; text-align: right;">
            <div style="border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h3 style="margin: 0; color: #0284c7; font-size: 18px;">${settings.companyName}</h3>
                    <div>
                        <h4 style="margin: 0; font-size: 16px;">فاتورة مبيعات</h4>
                        <p style="margin: 2px 0 0 0; font-size: 12px; text-align: left;">رقم: ${inv.id}</p>
                        <p style="margin: 2px 0 0 0; font-size: 12px; text-align: left;">التاريخ: ${inv.date}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; font-size: 12px; color: #475569; background: #f8fafc; padding: 6px 10px; border-radius: 4px;">
                    <span><strong>صاحب الشركة:</strong> ${settings.owner}</span>
                    <span>|</span>
                    <span><strong>الهاتف:</strong> ${settings.whatsapp}</span>
                    <span>|</span>
                    <span><strong>العنوان:</strong> ${settings.address}</span>
                </div>
            </div>

            <div style="background: #f1f5f9; padding: 10px; margin-bottom: 15px; font-size: 13px; border-radius: 4px;">
                <strong>العميل:</strong> ${inv.customerName} | <strong>الهاتف:</strong> ${inv.customerPhone || '-'} | <strong>العنوان:</strong> ${inv.customerAddress || '-'}
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
                <thead>
                    <tr style="background: #e2e8f0;">
                        <th style="padding: 8px; text-align: right;">الصنف</th>
                        <th style="padding: 8px; text-align: center;">الكمية</th>
                        <th style="padding: 8px; text-align: center;">السعر</th>
                        <th style="padding: 8px; text-align: left;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <div style="display: flex; justify-content: space-between; border-top: 1px solid #ccc; padding-top: 10px; font-size: 13px;">
                <div>
                    <p style="margin: 3px 0;"><strong>المدفوع:</strong> ${(inv.paid || 0).toLocaleString()} ج.م</p>
                    <p style="margin: 3px 0; color: #e11d48;"><strong>المتبقي:</strong> ${(inv.remaining || 0).toLocaleString()} ج.م</p>
                </div>
                <div style="text-align: left; font-size: 15px;">
                    <p style="margin: 0;"><strong>الإجمالي الصافي: ${inv.total.toLocaleString()} ج.م</strong></p>
                </div>
            </div>
        </div>

        <div style="text-align: center; margin-top: 15px;">
            <button onclick="sendToWhatsAppNabawy()" style="background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; margin-left: 5px;"><i class="fab fa-whatsapp"></i> إرسال لمحمد النبوي</button>
        </div>
    `;
    let invoiceModal = document.getElementById('invoiceModal');
    if(invoiceModal) invoiceModal.style.display = 'flex';
};

window.closeInvoiceModal = function() { 
    let modal = document.getElementById('invoiceModal');
    if(modal) modal.style.display = 'none'; 
};

window.downloadPDF = function() {
    if(!window.jspdf || !currentInvoiceData) return;
    const { jsPDF } = window.jspdf;
    let element = document.getElementById('printableInvoiceArea');
    if(!element) return;
    html2canvas(element, { scale: 2 }).then(canvas => {
        let imgData = canvas.toDataURL('image/png');
        let pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(imgData, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
        pdf.save(`Invoice-${currentInvoiceData.id}.pdf`);
    });
};

window.sendToWhatsApp = function() {
    if(!currentInvoiceData) return;
    let msg = `*${settings.companyName}*\n` +
              `📄 *فاتورة رقم:* ${currentInvoiceData.id}\n` +
              `👤 *العميل:* ${currentInvoiceData.customerName}\n` +
              `💰 *الإجمالي:* ${currentInvoiceData.total.toLocaleString()} ج.م\n` +
              `💵 *المدفوع:* ${(currentInvoiceData.paid || 0).toLocaleString()} ج.م\n` +
              `📌 *المتبقي:* ${(currentInvoiceData.remaining || 0).toLocaleString()} ج.م\n` +
              `شكراً لتعاملكم معنا!`;
    let phone = settings.whatsapp.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.sendToWhatsAppNabawy = function() {
    if(!currentInvoiceData) return;
    let msg = `*${settings.companyName}*\n` +
              `📄 *فاتورة رقم:* ${currentInvoiceData.id}\n` +
              `👤 *العميل:* ${currentInvoiceData.customerName}\n` +
              `💰 *الإجمالي:* ${currentInvoiceData.total.toLocaleString()} ج.م\n` +
              `💵 *المدفوع:* ${(currentInvoiceData.paid || 0).toLocaleString()} ج.م\n` +
              `📌 *المتبقي:* ${(currentInvoiceData.remaining || 0).toLocaleString()} ج.م`;
    let phone = (settings.whatsappNabawy || '01092201111').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.saveSettings = function(e) {
    if(e) e.preventDefault();
    settings.companyName = document.getElementById('companyNameInput')?.value || settings.companyName;
    settings.owner = document.getElementById('companyOwnerInput')?.value || settings.owner;
    settings.whatsapp = document.getElementById('whatsappNumberInput')?.value || settings.whatsapp;
    settings.address = document.getElementById('companyAddressInput')?.value || settings.address;
    saveData();
    alert('تم الحفظ بنجاح!');
};

function initChart() {
    const ctx = document.getElementById('salesPurchasesChart');
    if(!ctx || typeof Chart === 'undefined') return;
    mainChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
            datasets: [
                { label: 'المبيعات', data: [12000, 19000, 15000, 25000, 32000, 41000, 48000, 0, 0, 0, 0, 0], borderColor: '#10b981', tension: 0.3 },
                { label: 'المشتريات', data: [10000, 15000, 12000, 20000, 28000, 35000, 40000, 0, 0, 0, 0, 0], borderColor: '#f97316', tension: 0.3 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
// منع التكبير والتصغير (Pinch-to-Zoom) تماماً بالصوابع على الموبايل والتابلت
document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
});

document.addEventListener('touchmove', function(e) {
    if (e.scale !== 1) {
        e.preventDefault();
    }
}, { passive: false });
document.addEventListener("DOMContentLoaded", function() {
    // إنشاء زر القائمة للموبايل والتابلت تلقائياً لو مش موجود
    let sidebar = document.querySelector('.sidebar') || document.querySelector('div[style*="width: 260px"]');
    if (sidebar && !document.getElementById('mobileMenuToggleBtn')) {
        let btn = document.createElement('button');
        btn.id = 'mobileMenuToggleBtn';
        btn.innerHTML = '<i class="fas fa-bars"></i>';
        document.body.appendChild(btn);

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('mobile-open');
        });

        // إغلاق القائمة لو المستخدم دوس في أي مكان برها
        document.addEventListener('click', function(e) {
            if (!sidebar.contains(e.target) && e.target !== btn) {
                sidebar.classList.remove('mobile-open');
            }
        });
    }
});
