// --- تهيئة Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyDLD-Y6d7LcyqB0rf3YYbJLTFHDXUsWQNM",
    authDomain: "protech-system.firebaseapp.com",
    projectId: "protech-system",
    storageBucket: "protech-system.firebasestorage.app",
    messagingSenderId: "184422532312",
    appId: "1:184422532312:web:76df7769c281c66fca43ad",
    measurementId: "G-1RRP97BPJC"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Data State
let inventory = [
    { code: 'PR-001', name: 'حبر طابعة ياباني أسود ليزر', qty: 45, unit: 'لتر', price: 1200 },
    { code: 'PR-002', name: 'ماكينة طباعة رقمية موديل X', qty: 5, unit: 'قطعة', price: 25000 },
    { code: 'PR-003', name: 'رول استيكر حراري عالي الجودة', qty: 120, unit: 'لفة', price: 150 }
];

let customers = [];
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

window.onload = function() {
    loadDataFromFirebase();
    initChart();
};

// جلب البيانات مباشرة من سحاب فايربيس لتحديث الأرقام والجداول فوراً
function loadDataFromFirebase() {
    // جلب العملاء
    db.collection("customers").onSnapshot((snapshot) => {
        customers = [];
        snapshot.forEach((doc) => {
            customers.push({ id: doc.id, ...doc.data() });
        });
        renderCustomers();
        populateSelects();
    });

    // جلب الفواتير
    db.collection("invoices").onSnapshot((snapshot) => {
        invoices = [];
        snapshot.forEach((doc) => {
            invoices.push({ id: doc.id, ...doc.data() });
        });
        renderDashboard();
        renderInvoices();
    });

    // جلب المخزون
    db.collection("inventory").onSnapshot((snapshot) => {
        if (!snapshot.empty) {
            inventory = [];
            snapshot.forEach((doc) => {
                inventory.push({ id: doc.id, ...doc.data() });
            });
        }
        renderInventory();
        renderDashboard();
        populateSelects();
    });

    // جلب المشتريات
    db.collection("purchases").onSnapshot((snapshot) => {
        purchases = [];
        snapshot.forEach((doc) => {
            purchases.push({ id: doc.id, ...doc.data() });
        });
        renderPurchases();
        renderDashboard();
    });
}

function refreshAllData() {
    renderDashboard();
    renderInventory();
    renderInvoices();
    renderPurchases();
    renderCustomers();
    populateSelects();
}

// حل مشكلة التنقل بين الأقسام (الصفحة ثابتة)
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-links li, .nav-links button').forEach(el => el.classList.remove('active'));
    
    let targetTab = document.getElementById('tab-' + tabId);
    if(targetTab) {
        targetTab.classList.add('active');
    }
    if(event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

// حساب وتحديث لوحة المؤشرات والأرقام
function renderDashboard() {
    let totalStock = inventory.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    let totalSales = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    let totalPurchases = purchases.reduce((sum, p) => sum + Number(p.cost || 0), 0);
    let totalProfit = totalSales - totalPurchases;

    let statStockElem = document.getElementById('statTotalStock');
    let statSalesElem = document.getElementById('statTotalSales');
    let statPurchasesElem = document.getElementById('statTotalPurchases');
    let statCustomersElem = document.getElementById('statTotalCustomers');

    if(statStockElem) statStockElem.innerText = totalStock;
    if(statSalesElem) statSalesElem.innerText = totalSales.toLocaleString();
    if(statPurchasesElem) statPurchasesElem.innerText = totalPurchases.toLocaleString();
    if(statCustomersElem) statCustomersElem.innerText = customers.length;

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
                    <td>${(inv.total || 0).toLocaleString()} ج.م</td>
                    <td>${inv.date}</td>
                </tr>
            `;
        });
    }

    let alertsList = document.getElementById('lowStockAlertsList');
    if(alertsList) {
        alertsList.innerHTML = '';
        let lowItems = inventory.filter(i => Number(i.qty) < 10);
        if(lowItems.length === 0) {
            alertsList.innerHTML = '<p style="color:#10b981; font-size:14px;"><i class="fas fa-check-circle"></i> جميع الأصناف في المخزون متوفرة.</p>';
        } else {
            lowItems.forEach(i => {
                alertsList.innerHTML += `<div class="alert-item"><span>${i.name}</span> <span class="badge-danger">متبقي: ${i.qty} ${i.unit || ''}</span></div>`;
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
                <td>${item.code || ''}</td>
                <td>${item.name || ''}</td>
                <td><strong>${item.qty || 0}</strong></td>
                <td>${item.unit || ''}</td>
                <td>${Number(item.price || 0).toLocaleString()} ج.م</td>
                <td>
                    <button class="btn-danger-sm" onclick="deleteProduct('${item.id || index}')"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

function filterInventory() {
    let query = document.getElementById('searchInventory').value.toLowerCase();
    let rows = document.querySelectorAll('#inventoryTableBody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
}

function openAddProductModal() { document.getElementById('addProductModal').style.display = 'flex'; }
function closeAddProductModal() { document.getElementById('addProductModal').style.display = 'none'; }

function addNewProduct(e) {
    e.preventDefault();
    let code = document.getElementById('prodCode').value;
    let name = document.getElementById('prodName').value;
    let qty = Number(document.getElementById('prodQty').value);
    let unit = document.getElementById('prodUnit').value;
    let price = Number(document.getElementById('prodPrice').value);

    db.collection("inventory").add({ code, name, qty, unit, price }).then(() => {
        closeAddProductModal();
        e.target.reset();
        alert('تم إضافة المنتج وتحديث المخزون أونلاين!');
    });
}

function deleteProduct(id) {
    if(confirm('هل أنت متأكد من حذف هذا الصنف؟')) {
        db.collection("inventory").doc(id).delete().then(() => {
            refreshAllData();
        });
    }
}

function renderPurchases() {
    let tbody = document.getElementById('purchasesTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    purchases.forEach((p, index) => {
        tbody.innerHTML += `
            <tr>
                <td>PO-${1000 + index}</td>
                <td>${p.supplier || ''}</td>
                <td>${p.productName || ''}</td>
                <td><span style="color: #10b981; font-weight: bold;">+${p.qty || 0}</span></td>
                <td>${Number(p.unitCost || 0).toLocaleString()} ج.م</td>
                <td>${Number(p.cost || 0).toLocaleString()} ج.م</td>
                <td>${p.date || ''}</td>
                <td>
                    <button class="btn-danger-sm" onclick="deletePurchase('${p.id}')"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

function openNewPurchaseModal() { document.getElementById('newPurchaseModal').style.display = 'flex'; }
function closeNewPurchaseModal() { document.getElementById('newPurchaseModal').style.display = 'none'; }

function createNewPurchase(e) {
    e.preventDefault();
    let supplier = document.getElementById('purchaseSupplier').value;
    let prodCode = document.getElementById('purchaseProductSelect').value;
    let qty = Number(document.getElementById('purchaseQty').value);
    let unitCost = Number(document.getElementById('purchaseUnitCost').value || document.getElementById('purchaseCost').value);
    let totalCost = unitCost * qty;

    let product = inventory.find(i => i.code === prodCode);
    if(product) {
        let newQty = Number(product.qty) + qty;
        // تحديث كمية المنتج في فايربيس
        if(product.id) {
            db.collection("inventory").doc(product.id).update({ qty: newQty });
        }
        
        db.collection("purchases").add({
            supplier,
            productCode: prodCode,
            productName: product.name,
            qty,
            unitCost,
            cost: totalCost,
            date: new Date().toLocaleDateString('ar-EG')
        }).then(() => {
            closeNewPurchaseModal();
            e.target.reset();
            alert('تم تسجيل الشراء وزيادة المخزون أونلاين بنجاح!');
        });
    }
}

function deletePurchase(id) {
    if(confirm('هل تريد حذف عملية الشراء هذه؟')) {
        db.collection("purchases").doc(id).delete().then(() => {
            refreshAllData();
        });
    }
}

function populateSelects() {
    let custSelect = document.getElementById('invoiceCustomerSelect');
    if(custSelect) {
        custSelect.innerHTML = '<option value="">-- اختر عميل مسجل --</option>';
        customers.forEach(c => {
            custSelect.innerHTML += `<option value="${c.name}">${c.name} (${c.phone || ''})</option>`;
        });
        custSelect.innerHTML += `<option value="NEW_CUSTOMER" style="color: #0284c7; font-weight: bold;">+ إضافة عميل جديد...</option>`;
    }

    let prodSelect = document.getElementById('invoiceProductSelect');
    if(prodSelect) {
        prodSelect.innerHTML = '';
        inventory.forEach(i => {
            prodSelect.innerHTML += `<option value="${i.code}" data-price="${i.price}" data-qty="${i.qty}">${i.name} (المتاح: ${i.qty} ${i.unit || ''} - ${i.price} ج.م)</option>`;
        });
        updateMaxQuantity();
    }

    let purProdSelect = document.getElementById('purchaseProductSelect');
    if(purProdSelect) {
        purProdSelect.innerHTML = '';
        inventory.forEach(i => {
            purProdSelect.innerHTML += `<option value="${i.code}">${i.name}</option>`;
        });
    }
}

function handleCustomerSelectChange() {
    let val = document.getElementById('invoiceCustomerSelect').value;
    let newDiv = document.getElementById('newCustomerDiv');
    if(newDiv) {
        newDiv.style.display = (val === 'NEW_CUSTOMER') ? 'block' : 'none';
    }
}

function updateMaxQuantity() {
    let select = document.getElementById('invoiceProductSelect');
    if(!select || select.options.length === 0) return;
    let opt = select.options[select.selectedIndex];
    if(opt) {
        let maxQty = opt.getAttribute('data-qty');
        let hint = document.getElementById('maxQtyHint');
        if(hint) hint.innerText = `الكمية المتاحة: ${maxQty}`;
        let qtyInput = document.getElementById('invoiceQty');
        if(qtyInput) qtyInput.max = maxQty;
    }
}

function openNewInvoiceModal() {
    document.getElementById('newInvoiceModal').style.display = 'flex';
    populateSelects();
}
function closeNewInvoiceModal() { document.getElementById('newInvoiceModal').style.display = 'none'; }

function createNewInvoice(e) {
    e.preventDefault();
    
    let customerSelectVal = document.getElementById('invoiceCustomerSelect').value;
    let customerName = customerSelectVal;
    let customerPhone = '';
    let customerAddress = '';

    if(customerSelectVal === 'NEW_CUSTOMER') {
        customerName = document.getElementById('newCustomerName').value.trim();
        customerPhone = document.getElementById('newCustomerPhone').value.trim();
        customerAddress = document.getElementById('newCustomerAddress').value.trim();
        if(customerName) {
            db.collection("customers").add({ name: customerName, phone: customerPhone, address: customerAddress });
        }
    } else {
        let foundCust = customers.find(c => c.name === customerSelectVal);
        if(foundCust) {
            customerPhone = foundCust.phone;
            customerAddress = foundCust.address;
        }
    }

    let prodSelect = document.getElementById('invoiceProductSelect');
    let prodCode = prodSelect.value;
    let opt = prodSelect.options[prodSelect.selectedIndex];
    let productName = opt.text.split(' (')[0];
    let unitPrice = Number(opt.getAttribute('data-price'));
    let qty = Number(document.getElementById('invoiceQty').value);
    let availableQty = Number(opt.getAttribute('data-qty'));

    if(qty > availableQty) {
        alert('الكمية المطلوبة أكبر من المتاح في المخزون!');
        return;
    }

    let totalAmount = unitPrice * qty;
    let paymentStatus = document.getElementById('invoicePaymentStatus').value;
    let paidAmount = totalAmount;
    let remainingAmount = 0;

    if(paymentStatus === 'لم يدفع') {
        remainingAmount = Number(document.getElementById('invoiceRemainingInput').value) || 0;
        paidAmount = totalAmount - remainingAmount;
        if(paidAmount < 0) paidAmount = 0;
    }

    let prodObj = inventory.find(i => i.code === prodCode);
    if(prodObj && prodObj.id) {
        let newQty = Number(prodObj.qty) - qty;
        db.collection("inventory").doc(prodObj.id).update({ qty: newQty });
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

    db.collection("invoices").add(newInv).then(() => {
        closeNewInvoiceModal();
        showInvoiceModal(newInv);
        alert('تم حفظ الفاتورة أونلاين بنجاح!');
    });
}

function renderInvoices() {
    let tbody = document.getElementById('invoicesTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    invoices.slice().reverse().forEach(inv => {
        let statusBadge = (Number(inv.remaining) > 0) 
            ? `<span class="badge-danger">متبقي: ${inv.remaining} ج.م</span>` 
            : '<span class="badge-success">تم الدفع بالكامل</span>';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${inv.id}</strong></td>
                <td>${inv.customerName}</td>
                <td>${inv.date}</td>
                <td>${Number(inv.total || 0).toLocaleString()} ج.م</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-primary-sm" onclick='showInvoiceModal(${JSON.stringify(inv)})'><i class="fas fa-eye"></i> معاينة</button>
                    <button class="btn-danger-sm" onclick="deleteInvoice('${inv.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function filterInvoices() {
    let query = document.getElementById('searchInvoices').value.toLowerCase();
    let rows = document.querySelectorAll('#invoicesTableBody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
    });
}

function deleteInvoice(id) {
    if(confirm('هل تريد حذف هذه الفاتورة؟')) {
        let invToDelete = invoices.find(i => i.id === id);
        if(invToDelete && invToDelete.id) {
            db.collection("invoices").doc(invToDelete.id).delete().then(() => {
                refreshAllData();
            });
        }
    }
}

function renderCustomers() {
    let tbody = document.getElementById('customersTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    customers.forEach((c, index) => {
        let custInvoices = invoices.filter(i => i.customerName === c.name);
        let totalSpent = custInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0);
        let totalRemaining = custInvoices.reduce((sum, i) => sum + Number(i.remaining || 0), 0);

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
                    <button class="btn-danger-sm" onclick="deleteCustomer('${c.id}')" style="margin-right: 10px;"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

function openAddCustomerModal() { document.getElementById('addCustomerModal').style.display = 'flex'; }
function closeAddCustomerModal() { document.getElementById('addCustomerModal').style.display = 'none'; }

function addNewCustomerDirect(e) {
    e.preventDefault();
    let name = document.getElementById('custName').value.trim();
    let phone = document.getElementById('custPhone').value.trim();
    let address = document.getElementById('custAddress').value.trim();

    if(!name) return;
    db.collection("customers").add({ name, phone, address }).then(() => {
        closeAddCustomerModal();
        e.target.reset();
        alert('تم حفظ العميل أونلاين بنجاح!');
    });
}

function deleteCustomer(id) {
    if(confirm('هل أنت متأكد من حذف هذا العميل؟')) {
        db.collection("customers").doc(id).delete().then(() => {
            refreshAllData();
        });
    }
}

function showInvoiceModal(inv) {
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
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${Number(item.price || 0).toLocaleString()} ج.م</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${Number(item.total || 0).toLocaleString()} ج.م</td>
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
                    <p style="margin: 3px 0;"><strong>المدفوع:</strong> ${Number(inv.paid || 0).toLocaleString()} ج.م</p>
                    <p style="margin: 3px 0; color: #e11d48;"><strong>المتبقي:</strong> ${Number(inv.remaining || 0).toLocaleString()} ج.م</p>
                </div>
                <div style="text-align: left; font-size: 15px;">
                    <p style="margin: 0;"><strong>الإجمالي الصافي: ${Number(inv.total || 0).toLocaleString()} ج.م</strong></p>
                </div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 15px;">
            <button onclick="sendToWhatsAppNabawy()" style="background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fab fa-whatsapp"></i> إرسال لمحمد النبوي</button>
        </div>
    `;
    document.getElementById('invoiceModal').style.display = 'flex';
}

function closeInvoiceModal() { document.getElementById('invoiceModal').style.display = 'none'; }

function sendToWhatsAppNabawy() {
    if(!currentInvoiceData) return;
    let msg = `*${settings.companyName}*\n` +
              `📄 *فاتورة رقم:* ${currentInvoiceData.id}\n` +
              `👤 *العميل:* ${currentInvoiceData.customerName}\n` +
              `💰 *الإجمالي:* ${Number(currentInvoiceData.total || 0).toLocaleString()} ج.م`;
    let phone = (settings.whatsappNabawy || '01092201111').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function initChart() {
    const ctx = document.getElementById('salesPurchasesChart');
    if(!ctx) return;
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
