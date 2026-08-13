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
    { code: 'PR-003', name: 'رول استيكر حراري عالي الجودة', qty: 120, unit: 'لفة', price: 150 },
    { code: 'PR-ECO-IN', name: 'ايكو سولفينت إن دور', qty: 50, unit: 'لتر', price: 450 },
    { code: 'PR-OUT', name: 'أوت دور', qty: 50, unit: 'لتر', price: 500 }
];

let customers = [
    { name: 'شركة النور للاستيراد', phone: '01012345678', address: 'القاهرة', oldBalance: 0, oldBalanceDate: '', balanceType: 'none' },
    { name: 'مؤسسة الهلال التجارية', phone: '01098765432', address: 'الجيزة', oldBalance: 0, oldBalanceDate: '', balanceType: 'none' }
];

let invoices = [];
let purchases = [];

let settings = {
    companyName: 'Bro Tech',
    owner: 'وائل غنيم',
    whatsapp: '01020008299',
    whatsappNabawy: '01092201111',
    address: '195 شارع جسر السويس'
};

let currentInvoiceData = null;
let mainChartInstance = null;

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
    if(profitElem) profitElem.innerText = totalProfit.toLocaleString() + ' ج.م';

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
        let lowItems = inventory.filter(i => i.qty < 20);
        if(lowItems.length === 0) {
            alertsList.innerHTML = '<p style="color:#10b981; font-size:14px;"><i class="fas fa-check-circle"></i> جميع الأصناف في المخزون متوفرة.</p>';
        } else {
            lowItems.forEach(i => {
                alertsList.innerHTML += `<div class="alert-item"><span><bdi style="unicode-bidi: isolate; direction: auto;">${i.name}</bdi></span> <span class="badge-danger">متبقي: ${i.qty} ${i.unit}</span></div>`;
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
                <td><bdi style="unicode-bidi: isolate; direction: auto;">${item.name}</bdi></td>
                <td><strong>${item.qty}</strong></td>
                <td>${item.unit}</td>
                <td>${item.price.toLocaleString()} ج.م</td>
                <td>
                    <button onclick="openEditProductModal(${index})" style="background: #0284c7; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-left: 5px;"><i class="fas fa-edit"></i> تعديل</button>
                    <button onclick="deleteProduct(${index})" style="background: #f43f5e; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

window.filterInventory = function() {
    let searchInput = document.getElementById('searchInventory');
    if(!searchInput) return;
    let query = searchInput.value.toLowerCase();
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
                <td><bdi style="unicode-bidi: isolate; direction: auto;">${p.productName}</bdi></td>
                <td><span style="color: #10b981; font-weight: bold;">+${p.qty}</span></td>
                <td>${(p.unitCost || 0).toLocaleString()} ج.م</td>
                <td>${p.cost.toLocaleString()} ج.م</td>
                <td>${p.date}</td>
                <td><button class="btn-danger-sm" onclick="deletePurchase(${index})"><i class="fas fa-trash"></i> حذف</button></td>
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
    let unitCost = Number(document.getElementById('purchaseUnitCost')?.value || document.getElementById('purchaseCost')?.value);
    let totalCost = unitCost * qty;

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
    if(confirm('هل تريد حذف عملية الشراء هذه؟')) {
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
            custSelect.innerHTML += `<option value="${c.name}">${c.name} (${c.phone || 'بدون هاتف'})</option>`;
        });
        custSelect.innerHTML += `<option value="NEW_CUSTOMER" style="color: #0284c7; font-weight: bold;">+ إضافة عميل جديد...</option>`;
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
    if(newDiv) newDiv.style.display = (val === 'NEW_CUSTOMER') ? 'block' : 'none';

    let found = customers.find(c => c.name === val);
    if(found) {
        let oldBalInput = document.getElementById('invoiceOldBalance');
        let oldBalType = document.getElementById('invoiceOldBalanceType');
        let oldBalDateInput = document.getElementById('invoiceOldBalanceDate');

        if(oldBalInput) oldBalInput.value = found.oldBalance || 0;
        if(oldBalType) oldBalType.value = found.balanceType || 'none';
        if(oldBalDateInput && found.oldBalanceDate) oldBalDateInput.value = found.oldBalanceDate;
        calculateInvoiceTotal();
    }
};

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
        <td style="padding: 5px; text-align: center;"><button type="button" onclick="this.closest('tr').remove(); calculateInvoiceTotal();" style="background:#f43f5e; color:#fff; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;"><i class="fas fa-trash"></i></button></td>
    `;
    tbody.appendChild(tr);
    
    let selectEl = tr.querySelector('.inv-item-code');
    if(selectedCode && selectEl) {
        window.updateRowPrice(selectEl);
    }
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
        subtotal += (qty * price);
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
    
    return finalTotal;
};

window.openNewInvoiceModal = function() {
    let modal = document.getElementById('newInvoiceModal');
    if(modal) modal.style.display = 'flex';
    populateSelects();

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

window.closeNewInvoiceModal = function() { document.getElementById('newInvoiceModal').style.display = 'none'; };

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
        if(customerName && !customers.some(c => c.name === customerName)) {
            customers.push({ name: customerName, phone: customerPhone, address: customerAddress, oldBalance: 0, balanceType: 'none' });
        }
    } else {
        let foundCust = customers.find(c => c.name === customerSelectVal);
        if(foundCust) {
            customerPhone = foundCust.phone;
            customerAddress = foundCust.address;
        }
    }

    let rows = document.querySelectorAll('#invoiceItemsBody tr');
    let items = [];
    let subtotal = 0;

    if(rows.length === 0) {
        alert('يرجى إضافة صنف واحد على الأقل للفاتورة!');
        return;
    }

    for(let tr of rows) {
        let selectEl = tr.querySelector('.inv-item-code');
        if(!selectEl || !selectEl.value) {
            alert('يرجى اختيار صنف صحيح في كل السطور!');
            return;
        }
        let prodCode = selectEl.value;
        let qty = Number(tr.querySelector('.inv-item-qty').value);
        let price = Number(tr.querySelector('.inv-item-price').value);
        
        let prodObj = inventory.find(i => i.code === prodCode);
        
        if(!prodObj) {
            alert(`الصنف المحدد غير موجود في المخزون!`);
            return;
        }

        if(qty > prodObj.qty) {
            alert(`الكمية المطلوبة للصنف (${prodObj.name}) أكبر من المتاح في المخزون (${prodObj.qty})!`);
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

    let paymentStatus = document.getElementById('invoicePaymentStatus')?.value;
    let paidAmount = finalTotal;
    let remainingAmount = 0;

    if(paymentStatus === 'لم يدفع') {
        remainingAmount = Number(document.getElementById('invoiceRemainingInput')?.value) || 0;
        paidAmount = finalTotal - remainingAmount;
        if(paidAmount < 0) paidAmount = 0;
    }

    items.forEach(item => {
        let prodObj = inventory.find(i => i.code === item.code);
        if(prodObj) {
            prodObj.qty = Number(prodObj.qty) - Number(item.qty);
            if(prodObj.qty < 0) prodObj.qty = 0;
        }
    });

    let invoiceId = 'INV-' + Math.floor(1000 + Math.random() * 9000);
    let currentDate = new Date().toLocaleDateString('ar-EG');

    let newInv = {
        id: invoiceId, customerName, customerPhone, customerAddress,
        items, subtotal, discountPercent, discountAmount,
        oldBalance, oldBalanceType, oldBalanceDate,
        total: finalTotal, paid: paidAmount, remaining: remainingAmount,
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
        let statusBadge = (inv.remaining > 0) ? `<span class="badge-danger">متبقي: ${inv.remaining} ج.م</span>` : '<span class="badge-success">تم الدفع بالكامل</span>';
        let invString = encodeURIComponent(JSON.stringify(inv));
        tbody.innerHTML += `
            <tr>
                <td><strong>${inv.id}</strong></td>
                <td>${inv.customerName}</td>
                <td>${inv.date}</td>
                <td>${inv.total.toLocaleString()} ج.م</td>
                <td>${statusBadge}</td>
                <td>
                    <button onclick='showInvoiceModalEncoded("${invString}")' style="background: #0284c7; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-left:5px;"><i class="fas fa-eye"></i> معاينة</button>
                    <button onclick="deleteInvoice('${inv.id}')" style="background: #f43f5e; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.filterInvoices = function() {
    let query = document.getElementById('searchInvoices')?.value.toLowerCase() || '';
    document.querySelectorAll('#invoicesTableBody tr').forEach(row => {
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
        let totalSales = custInvoices.reduce((sum, i) => sum + Number(i.total), 0);
        let totalRemaining = custInvoices.reduce((sum, i) => sum + Number(i.remaining || 0), 0);

        let oldBalText = 'لا يوجد';
        if(c.oldBalance && c.oldBalance > 0) {
            let typeLabel = c.balanceType === 'on_him' ? 'عليه (مدين)' : 'له (دائن)';
            oldBalText = `${c.oldBalance.toLocaleString()} ج.م (${typeLabel}) بتاريخ: ${c.oldBalanceDate || 'غير محدد'}`;
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.phone || 'غير مسجل'}</td>
                <td>${c.address || 'غير مسجل'}</td>
                <td style="font-size: 12px; color: #cbd5e1;">${oldBalText}</td>
                <td><strong style="color: #f43f5e;">${totalRemaining.toLocaleString()} ج.م</strong></td>
                <td><strong style="color: #0284c7;">${totalSales.toLocaleString()} ج.م</strong></td>
                <td>
                    <button onclick="openEditCustomerBalance(${index})" style="background: #0284c7; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; margin-left: 4px;"><i class="fas fa-history"></i> تعديل الحساب</button>
                    <button onclick="deleteCustomer(${index})" style="background: #f43f5e; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.openAddCustomerModal = function() { document.getElementById('addCustomerModal').style.display = 'flex'; };
window.closeAddCustomerModal = function() { document.getElementById('addCustomerModal').style.display = 'none'; };

window.showInvoiceModalEncoded = function(encodedInv) {
    window.showInvoiceModal(JSON.parse(decodeURIComponent(encodedInv)));
};

// ==========================================
// التعديل المطلوب: زر تعديل الفاتورة في المعاينة
// ==========================================
window.editInvoiceStatusModal = function() {
    let inv = window.activePrintingInvoice || currentInvoiceData;
    if(!inv) return;

    let newStatus = prompt(`تعديل حالة الفاتورة (${inv.id}):\nاكتب (مدفوع) لو العميل دفع بالكامل\nاكتب (آجل) لو المبلغ متبقي عليه`, inv.remaining > 0 ? 'آجل' : 'مدفوع');
    if(!newStatus) return;

    if(newStatus.includes('مدفوع')) {
        inv.paid = inv.total;
        inv.remaining = 0;
        inv.status = 'تم الدفع بالكامل';
    } else {
        let remVal = prompt(`أدخل المبلغ المتبقي على العميل:`, inv.remaining || 0);
        inv.remaining = Number(remVal) || 0;
        inv.paid = inv.total - inv.remaining;
        inv.status = `متبقي: ${inv.remaining} ج.م`;
    }

    saveData();
    refreshAllData();
    window.showInvoiceModal(inv);
    alert('تم تعديل وحفظ حالة الفاتورة بنجاح!');
};

window.showInvoiceModal = function(inv) {
    currentInvoiceData = inv;
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
        oldBalPrintHtml = `<p style="margin: 3px 0;">${label}: ${inv.oldBalance.toLocaleString()} ج.م</p>`;
    }

    let discountPrintHtml = '';
    if(inv.discountPercent && inv.discountPercent > 0) {
        discountPrintHtml = `<p style="margin: 3px 0; color: #10b981;">خصم (${inv.discountPercent}%): -${(inv.discountAmount || 0).toLocaleString()} ج.م</p>`;
    }

    area.innerHTML = `
        <div style="background: #fff; color: #000; padding: 20px; font-family: Tahoma, sans-serif; direction: rtl; text-align: right; width: 100%; box-sizing: border-box;">
            
            <div style="text-align: center; margin-bottom: 10px;">
                <h1 style="margin: 0 0 5px 0; color: #0284c7; font-size: 24px; font-weight: bold;">Bro Tech</h1>
                <p style="margin: 2px 0; font-size: 13px; color: #475569;">لصيانه و بيع جميع انواع مكن الطباعه</p>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; font-size: 13px;">
                <div>
                    <p style="margin: 2px 0;"><strong>العنوان:</strong> 195 شارع جسر السويس</p>
                    <p style="margin: 2px 0;"><strong>الهاتف:</strong> 01020008299</p>
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
                <p style="margin: 4px 0;">الإجمالي الفرعي: ${(inv.subtotal || inv.total).toLocaleString()} ج.م</p>
                ${discountPrintHtml}
                ${oldBalPrintHtml}
                <p style="margin: 6px 0; font-size: 15px; font-weight: bold; color: #0284c7;">الإجمالي النهائي: ${inv.total.toLocaleString()} ج.م</p>
                <p style="margin: 4px 0;">المدفوع: ${(inv.paid || 0).toLocaleString()} ج.م</p>
                <p style="margin: 4px 0; color: #e11d48; font-weight: bold;">المتبقي: ${(inv.remaining || 0).toLocaleString()} ج.م</p>
            </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 15px; padding: 10px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
            <button onclick="printInvoice()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fas fa-print"></i> طباعة الفاتورة</button>
            <button onclick="editInvoiceStatusModal()" style="background: #f59e0b; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fas fa-edit"></i> تعديل وظيفة الفاتورة</button>
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

    let printWindow = window.open('', '_blank', 'height=900,width=1000');
    printWindow.document.write(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>فاتورة مبيعات - Bro Tech</title>
            <style>
                body { font-family: Tahoma, sans-serif; padding: 20px; background: #ffffff; color: #000000; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #cbd5e1 !important; padding: 8px; }
            </style>
        </head>
        <body>
            <div style="width: 100%; max-width: 800px; margin: 0 auto; background: #fff; padding: 20px;">
                <div style="text-align: center; margin-bottom: 10px;">
                    <h1 style="margin: 0; color: #0284c7; font-size: 24px;">Bro Tech</h1>
                </div>
                <hr style="border-top: 2px solid #0284c7; margin: 10px 0;">
                <p><strong>العميل:</strong> ${inv.customerName}</p>
                <table>
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <p><strong>الإجمالي النهائي:</strong> ${inv.total.toLocaleString()} ج.م</p>
                <p><strong>المتبقي:</strong> ${(inv.remaining || 0).toLocaleString()} ج.م</p>
            </div>
            <script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 300); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
};
