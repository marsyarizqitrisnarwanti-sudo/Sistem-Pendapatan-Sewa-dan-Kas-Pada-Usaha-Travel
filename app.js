const state = { customers: [], drivers: [], trips: [], transactions: [] };
const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const localDateInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const byId = (items, id) => items.find(item => item.id === id);
const typeNames = { customer_payment: "Pembayaran pelanggan", driver_advance: "Uang jalan driver", operating_expense: "Biaya operasional", advance_return: "Pengembalian sisa uang jalan", driver_reimbursement: "Penggantian biaya driver", driver_commission: "Pencairan komisi (bersih)", driver_debt_repayment: "Pembayaran piutang driver" };
const categoryNames = { fuel: "Bensin", toll: "Tol", parking: "Parkir", meal: "Makan", other: "Lainnya" };
const statusNames = { booking: "Terjadwal", ongoing: "Berlangsung", completed: "Selesai", cancelled: "Dibatalkan", pending: "Menunggu validasi", validated: "Tervalidasi", rejected: "Ditolak" };
const typeDirection = { customer_payment: 1, driver_advance: -1, operating_expense: 0, advance_return: 1, driver_reimbursement: -1, driver_commission: -1, driver_debt_repayment: 1 };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  if (location.protocol === "file:") return localApi(path, options);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Permintaan gagal (${response.status})`);
  return result;
}

const LOCAL_STORAGE_KEY = "ruangkas-travel-data-v1";
const localTypes = new Set(["customer_payment", "driver_advance", "operating_expense", "advance_return", "driver_reimbursement"]);
const localCategories = new Set(["fuel", "toll", "parking", "meal", "other"]);
const localChannels = new Set(["cash", "bank"]);
const localTripStatuses = new Set(["booking", "ongoing", "completed", "cancelled"]);

function loadLocalData() {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? JSON.parse(saved) : { customers: [], drivers: [], trips: [], transactions: [] };
  } catch {
    throw new Error("Penyimpanan browser tidak tersedia. Coba buka file dengan Chrome.");
  }
}

function saveLocalData(data) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error("Browser tidak dapat menyimpan data. Periksa ruang penyimpanan yang tersedia.");
  }
}

function localId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 3) | 8).toString(16);
  });
}

async function localApi(path, options = {}) {
  const method = options.method || "GET";
  const parts = path.split("?")[0].split("/").filter(Boolean);
  const [resource, id, action] = parts;
  const body = options.body || {};
  const data = loadLocalData();
  const now = new Date().toISOString();

  if (method === "GET" && parts.length === 1 && ["customers", "drivers", "trips", "transactions"].includes(resource)) return data[resource];

  if (method === "POST" && parts.length === 1 && ["customers", "drivers"].includes(resource)) {
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Nama wajib diisi.");
    const person = { id: localId(), name, phone: body.phone || null, address: body.address || null, is_active: true, created_at: now };
    data[resource].push(person);
    saveLocalData(data);
    return person;
  }
  if (["PATCH", "DELETE"].includes(method) && parts.length === 2 && ["customers", "drivers"].includes(resource)) {
    const person = data[resource].find(item => item.id === id);
    if (!person) throw new Error("Kontak tidak ditemukan.");
    const foreignKey = resource === "customers" ? "customer_id" : "driver_id";
    if (method === "DELETE") {
      if (data.trips.some(trip => trip[foreignKey] === id)) throw new Error(`${resource === "customers" ? "Pelanggan" : "Driver"} sudah digunakan dalam perjalanan dan tidak dapat dihapus.`);
      data[resource] = data[resource].filter(item => item.id !== id);
      saveLocalData(data);
      return { message: "Kontak dihapus." };
    }
    Object.assign(person, { name: String(body.name || "").trim(), phone: body.phone || null, address: body.address || null });
    if (!person.name) throw new Error("Nama wajib diisi.");
    saveLocalData(data);
    return person;
  }

  if (method === "POST" && resource === "trips" && parts.length === 1) {
    if (!data.customers.some(item => item.id === body.customer_id)) throw new Error("Pilih pelanggan yang sudah tersimpan.");
    if (!data.drivers.some(item => item.id === body.driver_id)) throw new Error("Pilih driver yang sudah tersimpan.");
    const trip = { ...body, id: localId(), rental_amount: Number(body.rental_amount), commission_rate: Number(body.commission_rate ?? 10), status: "booking", created_at: now, completed_at: null, driver_settled_at: null };
    data.trips.push(trip);
    saveLocalData(data);
    return trip;
  }

  if (["PATCH", "DELETE"].includes(method) && resource === "trips" && parts.length === 2) {
    const trip = data.trips.find(item => item.id === id);
    if (!trip) throw new Error("Perjalanan tidak ditemukan.");
    if (method === "DELETE") {
      if (data.transactions.some(item => item.trip_id === id)) throw new Error("Perjalanan sudah memiliki transaksi kas/biaya sehingga tidak dapat dihapus.");
      data.trips = data.trips.filter(item => item.id !== id);
      saveLocalData(data);
      return { message: "Perjalanan dihapus." };
    }
    if (["completed", "cancelled"].includes(trip.status) || trip.driver_settled_at) throw new Error("Perjalanan selesai, dibatalkan, atau sudah diselesaikan tidak dapat diedit.");
    const amount = Number(body.rental_amount);
    const paid = data.transactions.filter(item => item.trip_id === id && item.type === "customer_payment").reduce((sum, item) => sum + Number(item.amount), 0);
    if (amount < paid) throw new Error(`Harga sewa tidak boleh lebih rendah dari pembayaran yang sudah diterima (${money(paid)}).`);
    Object.assign(trip, body, { rental_amount: amount, commission_rate: Number(body.commission_rate) });
    saveLocalData(data);
    return trip;
  }

  if (method === "PATCH" && resource === "trips" && action === "status") {
    const trip = data.trips.find(item => item.id === id);
    if (!trip) throw new Error("Perjalanan tidak ditemukan.");
    if (!localTripStatuses.has(body.status)) throw new Error("Status perjalanan tidak valid.");
    if (["completed", "cancelled"].includes(trip.status)) throw new Error("Perjalanan yang sudah selesai atau dibatalkan tidak dapat diubah.");
    trip.status = body.status;
    if (body.status === "completed") trip.completed_at = now;
    saveLocalData(data);
    return trip;
  }

  if (method === "PATCH" && resource === "transactions" && action === "review") {
    const transaction = data.transactions.find(item => item.id === id && item.type === "operating_expense");
    if (!transaction) throw new Error("Biaya belum ditemukan.");
    if (transaction.status !== "pending") throw new Error("Biaya sudah pernah diputuskan.");
    if (!["validated", "rejected"].includes(body.status)) throw new Error("Keputusan validasi tidak valid.");
    transaction.status = body.status;
    transaction.validated_at = now;
    transaction.validated_by = "admin";
    saveLocalData(data);
    return transaction;
  }

  if (method === "POST" && resource === "transactions" && parts.length === 1) {
    if (!localTypes.has(body.type)) throw new Error("Jenis aktivitas tidak valid.");
    if (!localChannels.has(body.channel)) throw new Error("Kanal pembayaran tidak valid.");
    const trip = data.trips.find(item => item.id === body.trip_id);
    if (!trip) throw new Error("Pilih perjalanan yang sudah tersimpan.");
    if (trip.status === "cancelled") throw new Error("Perjalanan sudah dibatalkan; transaksi baru tidak dapat ditambahkan.");
    if (trip.driver_settled_at) throw new Error("Perjalanan sudah diselesaikan.");
    if (body.type === "operating_expense" && !localCategories.has(body.category)) throw new Error("Kategori biaya tidak valid.");
    if (body.type === "customer_payment" && body.customer_id !== trip.customer_id) throw new Error("Pelanggan tidak sesuai dengan perjalanan.");
    const payments = data.transactions.filter(item => item.trip_id === trip.id && item.type === "customer_payment");
    const remaining = Math.max(0, Number(trip.rental_amount) - payments.reduce((sum, item) => sum + Number(item.amount), 0));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Jumlah transaksi harus lebih besar dari nol.");
    if (body.type === "customer_payment") {
      if (!["dp", "full"].includes(body.payment_stage)) throw new Error("Pilih pembayaran DP atau Lunas.");
      if (amount > remaining) throw new Error("Jumlah pembayaran melebihi sisa tagihan.");
      if (body.payment_stage === "dp" && amount >= remaining) throw new Error("Pilih Lunas untuk membayar seluruh sisa tagihan.");
    }
    const transaction = {
      ...body, id: localId(), amount,
      payment_stage: body.type === "customer_payment" ? body.payment_stage : null,
      driver_id: ["driver_advance", "operating_expense", "advance_return", "driver_reimbursement"].includes(body.type) ? trip.driver_id : null,
      status: body.type === "operating_expense" && body.status === "pending" ? "pending" : "validated",
      occurred_at: now,
      ...(body.type === "operating_expense" && body.status !== "pending" ? { validated_at: now, validated_by: "admin" } : {})
    };
    data.transactions.push(transaction);
    saveLocalData(data);
    return transaction;
  }

  if (["PATCH", "DELETE"].includes(method) && resource === "transactions" && parts.length === 2) {
    const transaction = data.transactions.find(item => item.id === id);
    if (!transaction) throw new Error("Transaksi tidak ditemukan.");
    if (["driver_commission", "driver_debt_repayment"].includes(transaction.type)) throw new Error("Transaksi penyelesaian komisi/piutang tidak dapat diedit atau dihapus.");
    const trip = data.trips.find(item => item.id === transaction.trip_id);
    if (trip?.driver_settled_at) throw new Error("Transaksi perjalanan yang sudah diselesaikan tidak dapat diubah.");
    if (method === "DELETE") {
      data.transactions = data.transactions.filter(item => item.id !== id);
      saveLocalData(data);
      return { message: "Transaksi dihapus." };
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Jumlah transaksi harus lebih besar dari nol.");
    if (!localChannels.has(body.channel)) throw new Error("Kanal pembayaran tidak valid.");
    if (transaction.type === "customer_payment") {
      const paidOther = data.transactions.filter(item => item.trip_id === transaction.trip_id && item.type === "customer_payment" && item.id !== id).reduce((sum, item) => sum + Number(item.amount), 0);
      const remaining = Number(trip.rental_amount) - paidOther;
      const nextAmount = amount;
      if (!["dp", "full"].includes(body.payment_stage) || nextAmount > remaining || (body.payment_stage === "dp" && nextAmount >= remaining)) throw new Error("Jenis atau jumlah pembayaran tidak sesuai dengan sisa tagihan.");
      Object.assign(transaction, { amount: nextAmount, payment_stage: body.payment_stage, channel: body.channel, notes: body.notes || null });
    } else {
      Object.assign(transaction, { amount, channel: body.channel, notes: body.notes || null });
      if (transaction.type === "operating_expense") {
        if (!localCategories.has(body.category)) throw new Error("Kategori biaya tidak valid.");
        transaction.category = body.category;
      }
    }
    saveLocalData(data);
    return transaction;
  }

  if (method === "POST" && resource === "trips" && action === "settle") {
    if (!localChannels.has(body.channel)) throw new Error("Kanal pembayaran tidak valid.");
    const trip = data.trips.find(item => item.id === id);
    if (!trip) throw new Error("Perjalanan tidak ditemukan.");
    if (trip.status !== "completed") throw new Error("Komisi hanya dapat diselesaikan setelah perjalanan selesai.");
    if (trip.driver_settled_at) throw new Error("Penyelesaian driver untuk perjalanan ini sudah tercatat.");
    const entries = data.transactions.filter(item => item.trip_id === id);
    if (entries.some(item => item.type === "operating_expense" && item.status === "pending")) throw new Error("Validasi semua biaya operasional sebelum menyelesaikan komisi.");
    const total = type => entries.filter(item => item.type === type && (type !== "operating_expense" || item.status === "validated")).reduce((sum, item) => sum + Number(item.amount), 0);
    const commission = Number(trip.rental_amount) * Number(trip.commission_rate) / 100;
    const net = Math.round((commission + total("operating_expense") + total("advance_return") - total("driver_advance") - total("driver_reimbursement") - total("driver_commission") + total("driver_debt_repayment")) * 100) / 100;
    if (Math.abs(net) > 0) {
      data.transactions.push({
        id: localId(), trip_id: id, driver_id: trip.driver_id,
        type: net > 0 ? "driver_commission" : "driver_debt_repayment",
        amount: Math.abs(net), channel: body.channel, status: "validated",
        notes: `Penyelesaian bersih. Komisi bruto ${commission.toFixed(2)}.`,
        occurred_at: now, validated_at: now, validated_by: "admin"
      });
    }
    trip.driver_settled_at = now;
    saveLocalData(data);
    const amount = Math.abs(net);
    const message = net > 0 ? `Penyelesaian bersih ${amount.toLocaleString("id-ID")} dibayarkan kepada driver.` : net < 0 ? `Driver perlu mengembalikan ${amount.toLocaleString("id-ID")} ke perusahaan; dicatat sebagai pelunasan piutang.` : "Komisi dan uang jalan sudah seimbang; penyelesaian dicatat tanpa pembayaran tambahan.";
    return { message, amount, direction: net > 0 ? "out" : net < 0 ? "in" : "none" };
  }

  throw new Error("Operasi ini tidak didukung saat index.html dibuka langsung. Buka aplikasi melalui server untuk sinkronisasi Supabase.");
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.remove("hidden");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => element.classList.add("hidden"), 3600);
}

function tripLabel(trip) {
  return trip ? `${trip.origin} → ${trip.destination}` : "Perjalanan";
}

function renderDashboard() {
  const completed = state.trips.filter(trip => trip.status === "completed");
  const revenue = completed.reduce((sum, trip) => sum + Number(trip.rental_amount), 0);
  const incoming = state.transactions.filter(item => typeDirection[item.type] === 1).reduce((sum, item) => sum + Number(item.amount), 0);
  const expense = state.transactions.filter(item => item.type === "operating_expense" && item.status === "validated").reduce((sum, item) => sum + Number(item.amount), 0);
  const balance = state.transactions.reduce((sum, item) => sum + Number(item.amount) * (typeDirection[item.type] || 0), 0);
  $("#stat-revenue").textContent = money(revenue);
  $("#stat-incoming").textContent = money(incoming);
  $("#stat-expenses").textContent = money(expense);
  $("#stat-balance").textContent = money(balance);
  const recent = [...state.trips].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  $("#recent-trips").innerHTML = recent.map(trip => `<tr><td><div class="trip-name">${esc(tripLabel(trip))}</div><div class="trip-meta">${esc(byId(state.customers, trip.customer_id)?.name || "Pelanggan")}</div></td><td>${date(trip.travel_date)}</td><td><span class="status-pill status-${trip.status}">${statusNames[trip.status]}</span></td><td class="align-right money-cell">${money(trip.rental_amount)}</td></tr>`).join("");
  $("#recent-empty").classList.toggle("hidden", recent.length > 0);
  const recentTransactions = [...state.transactions].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, 5);
  $("#recent-cash").innerHTML = recentTransactions.map(item => {
    const direction = typeDirection[item.type] || 0;
    const amountClass = direction > 0 ? "in" : direction < 0 ? "out" : "";
    const amountText = direction === 0 ? money(item.amount) : `${direction > 0 ? "+" : "−"}${money(item.amount)}`;
    return `<div class="cash-item"><span class="cash-icon ${amountClass}">${direction > 0 ? "↓" : direction < 0 ? "↑" : "◉"}</span><span class="cash-copy"><strong>${esc(typeNames[item.type] || item.type)}</strong><small>${esc(tripLabel(byId(state.trips, item.trip_id)))} · ${date(item.occurred_at)}</small></span><span class="cash-amount ${amountClass}">${amountText}</span></div>`;
  }).join("");
  $("#cash-empty").classList.toggle("hidden", recentTransactions.length > 0);
}

function renderTrips() {
  const query = ($("#trip-search")?.value || "").trim().toLowerCase();
  const trips = [...state.trips].sort((a, b) => new Date(b.travel_date) - new Date(a.travel_date))
    .filter(trip => `${tripLabel(trip)} ${byId(state.customers, trip.customer_id)?.name || ""} ${byId(state.drivers, trip.driver_id)?.name || ""}`.toLowerCase().includes(query));
  $("#trips-table").innerHTML = trips.map(trip => {
    const settled = Boolean(trip.driver_settled_at) || state.transactions.some(item => item.trip_id === trip.id && ["driver_commission", "driver_debt_repayment"].includes(item.type));
    const hasTransactions = state.transactions.some(item => item.trip_id === trip.id);
    const actions = `<div class="action-group">${trip.status !== "cancelled" ? `<button class="row-action" data-trip-transaction="${trip.id}" data-transaction-type="customer_payment">Pembayaran</button><button class="row-action" data-trip-transaction="${trip.id}" data-transaction-type="operating_expense">Biaya</button>` : ""}${trip.status === "completed" && !settled ? `<button class="row-action" data-settle="${trip.id}">Selesaikan driver</button>` : ""}${["booking","ongoing"].includes(trip.status) ? `<button class="row-action" data-edit-trip="${trip.id}">Edit</button><button class="row-action row-cancel" data-cancel-trip="${trip.id}">Batalkan</button>` : ""}${!hasTransactions && !settled ? `<button class="row-action row-delete" data-delete="trip" data-id="${trip.id}">Hapus</button>` : ""}</div>`;
    const canChangeStatus = ["booking", "ongoing"].includes(trip.status);
    return `<tr><td><div class="trip-name">${esc(tripLabel(trip))}</div><div class="trip-meta">${esc(trip.notes || "Sewa shuttle bus")}</div></td><td><div>${esc(byId(state.customers, trip.customer_id)?.name || "—")}</div><div class="sub-cell">Driver: ${esc(byId(state.drivers, trip.driver_id)?.name || "—")}</div></td><td>${date(trip.travel_date)}</td><td>${canChangeStatus ? `<select class="status-select" data-status="${trip.id}" aria-label="Ubah status perjalanan">${["booking","ongoing","completed"].map(value => `<option value="${value}" ${value === trip.status ? "selected" : ""}>${statusNames[value]}</option>`).join("")}</select>` : `<span class="status-pill status-${trip.status}">${statusNames[trip.status]}</span>`}</td><td>${Number(trip.commission_rate)}% <span class="sub-cell">(${money(Number(trip.rental_amount) * Number(trip.commission_rate) / 100)})</span></td><td class="align-right money-cell">${money(trip.rental_amount)}</td><td>${actions}</td></tr>`;
  }).join("");
  $("#trips-empty").classList.toggle("hidden", trips.length > 0);
}

function renderTransactions() {
  const filter = $("#transaction-filter")?.value || "all";
  const transactions = [...state.transactions].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).filter(item => filter === "all" || item.status === filter);
  $("#transactions-table").innerHTML = transactions.map(item => {
    const direction = typeDirection[item.type] || 0;
    const amountClass = direction > 0 ? "in" : direction < 0 ? "out" : "";
    const amountText = direction === 0 ? money(item.amount) : `${direction > 0 ? "+" : "−"}${money(item.amount)}`;
    const review = item.type === "operating_expense" && item.status === "pending" ? `<button class="row-action" data-review="${item.id}">Validasi</button>` : "";
    const sub = item.type === "operating_expense" ? categoryNames[item.category] || "Operasional" : typeNames[item.type];
    const paymentStatus = item.type === "customer_payment" ? (item.payment_stage === "full" ? "Lunas" : "DP") : null;
    const trip = byId(state.trips, item.trip_id);
    const immutable = ["driver_commission", "driver_debt_repayment"].includes(item.type) || Boolean(trip?.driver_settled_at);
    const actions = `${review}${!immutable ? `<button class="row-action" data-edit-transaction="${item.id}">Edit</button><button class="row-action row-delete" data-delete="transaction" data-id="${item.id}">Hapus</button>` : ""}`;
    return `<tr><td><div class="trip-name">${esc(sub)}</div><div class="trip-meta">${esc(item.notes || typeNames[item.type])}</div></td><td>${esc(tripLabel(trip))}</td><td>${date(item.occurred_at)}</td><td>${paymentStatus ? `<span class="status-pill status-${item.payment_stage === "full" ? "completed" : "pending"}">${paymentStatus}</span>` : item.type === "operating_expense" ? `<span class="status-pill status-${item.status}">${statusNames[item.status]}</span>` : "—"}</td><td>${item.channel === "cash" ? "Tunai" : "Bank"}</td><td class="align-right money-cell ${amountClass}">${amountText}</td><td><div class="action-group">${actions}</div></td></tr>`;
  }).join("");
  $("#transactions-empty").classList.toggle("hidden", transactions.length > 0);
  $("#pending-count").textContent = `${state.transactions.filter(item => item.type === "operating_expense" && item.status === "pending").length} biaya`;
  for (const channel of ["cash", "bank"]) {
    const total = state.transactions.filter(item => item.channel === channel).reduce((sum, item) => sum + Number(item.amount) * (typeDirection[item.type] || 0), 0);
    $(`#${channel}-balance`).textContent = money(total);
  }
}

function renderContacts() {
  $("#customer-count").textContent = state.customers.length;
  $("#driver-count").textContent = state.drivers.length;
  $("#customers-list").innerHTML = state.customers.map(person => `<div class="person-row"><span class="person-avatar">${esc(person.name.charAt(0).toUpperCase())}</span><span class="person-copy"><strong>${esc(person.name)}</strong><small>${esc(person.phone || person.address || "Belum ada detail kontak")}</small></span><span class="person-tag">Pelanggan</span><span class="action-group"><button class="row-action" data-edit-contact="customer:${person.id}">Edit</button><button class="row-action row-delete" data-delete="customer" data-id="${person.id}">Hapus</button></span></div>`).join("");
  $("#drivers-list").innerHTML = state.drivers.map(person => `<div class="person-row"><span class="person-avatar">${esc(person.name.charAt(0).toUpperCase())}</span><span class="person-copy"><strong>${esc(person.name)}</strong><small>${esc(person.phone || person.address || "Belum ada detail kontak")}</small></span><span class="person-tag">Komisi default 10%</span><span class="action-group"><button class="row-action" data-edit-contact="driver:${person.id}">Edit</button><button class="row-action row-delete" data-delete="driver" data-id="${person.id}">Hapus</button></span></div>`).join("");
  $("#customers-empty").classList.toggle("hidden", state.customers.length > 0);
  $("#drivers-empty").classList.toggle("hidden", state.drivers.length > 0);
}

function updateSelects() {
  $("#trip-customer").innerHTML = `<option value="">Pilih pelanggan</option>${state.customers.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("")}`;
  $("#trip-driver").innerHTML = `<option value="">Pilih driver</option>${state.drivers.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("")}`;
  $("#transaction-trip").innerHTML = `<option value="">Pilih perjalanan</option>${state.trips.map(item => `<option value="${item.id}">${esc(tripLabel(item))} · ${date(item.travel_date)}</option>`).join("")}`;
}

async function refresh() {
  const [customers, drivers, trips, transactions] = await Promise.all([
    api("/customers"), api("/drivers"), api("/trips"), api("/transactions")
  ]);
  state.customers = customers;
  state.drivers = drivers;
  state.trips = trips;
  state.transactions = transactions;
  renderDashboard();
  renderTrips();
  renderTransactions();
  renderContacts();
  updateSelects();
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (id === "trip-modal") {
    $("#trip-form").reset();
    $("#trip-form").elements.id.value = "";
    $("#trip-form").elements.travel_date.value = localDateInput();
    $("#trip-form").elements.commission_rate.value = 10;
    $("#quick-customer").classList.add("hidden");
    $("#quick-driver").classList.add("hidden");
    $("#trip-modal h2").textContent = "Tambah perjalanan";
    $("#trip-form").querySelector('[type="submit"]').textContent = "Simpan perjalanan";
  }
  if (id === "transaction-modal") {
    $("#transaction-form").reset();
    $("#transaction-form").elements.id.value = "";
    $("#transaction-modal h2").textContent = "Catat aktivitas";
    $("#transaction-form").querySelector('[type="submit"]').textContent = "Simpan aktivitas";
    updateTransactionFields();
  }
  if (id === "contact-modal") {
    $("#contact-form").reset();
    $("#contact-form").elements.id.value = "";
    $("#contact-modal h2").textContent = "Tambah kontak";
    $("#contact-form").querySelector('[type="submit"]').textContent = "Simpan kontak";
  }
  dialog.showModal();
}

function remainingPayment(tripId, excludeId = "") {
  const trip = byId(state.trips, tripId);
  if (!trip) return 0;
  const paid = state.transactions.filter(item => item.trip_id === tripId && item.type === "customer_payment" && item.id !== excludeId)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  return Math.max(0, Number(trip.rental_amount) - paid);
}

function updateTransactionFields() {
  const type = $("#transaction-type").value;
  const isExpense = type === "operating_expense";
  const isPayment = type === "customer_payment";
  const isEditing = Boolean($("#transaction-form").elements.id.value);
  $("#expense-fields").classList.toggle("hidden", !isExpense);
  $("#payment-stage-wrap").classList.toggle("hidden", !isPayment);
  $("#transaction-person-wrap").classList.toggle("hidden", !isPayment);
  $("#transaction-person-label").innerHTML = isPayment ? `Pelanggan<select name="person_id" id="transaction-person" required>${state.customers.map(person => `<option value="${person.id}">${esc(person.name)}</option>`).join("")}</select>` : "";
  $("#transaction-type").disabled = isEditing;
  $("#transaction-trip").disabled = isEditing;
  updatePaymentAmount();
}

function updatePaymentAmount() {
  const form = $("#transaction-form");
  const tripId = form.elements.trip_id.value;
  const payment = $("#transaction-type").value === "customer_payment";
  const stage = $("#payment-stage").value;
  const remaining = remainingPayment(tripId, form.elements.id.value);
  const amount = form.elements.amount;
  $("#payment-balance-help").textContent = tripId
    ? `Sisa tagihan: ${money(remaining)}${payment && stage === "full" ? " — nominal terisi otomatis dan tetap bisa diedit; untuk status Lunas nilainya harus sama dengan sisa tagihan." : ""}`
    : "Pilih perjalanan untuk melihat sisa tagihan.";
  amount.readOnly = false;
  if (payment && stage === "full" && document.activeElement !== amount) amount.value = remaining > 0 ? remaining : "";
}

function openTransaction(tripId, type) {
  openDialog("transaction-modal");
  const form = $("#transaction-form");
  form.elements.trip_id.value = tripId || "";
  $("#transaction-type").value = type || "customer_payment";
  updateTransactionFields();
  if ($("#transaction-person")) $("#transaction-person").value = byId(state.trips, tripId)?.customer_id || "";
}

function editTrip(id) {
  const trip = byId(state.trips, id);
  if (!trip) return;
  openDialog("trip-modal");
  const form = $("#trip-form");
  form.elements.id.value = trip.id;
  form.elements.customer_id.value = trip.customer_id;
  form.elements.driver_id.value = trip.driver_id;
  form.elements.origin.value = trip.origin;
  form.elements.destination.value = trip.destination;
  form.elements.travel_date.value = trip.travel_date;
  form.elements.rental_amount.value = trip.rental_amount;
  form.elements.commission_rate.value = trip.commission_rate;
  form.elements.notes.value = trip.notes || "";
  $("#trip-modal h2").textContent = "Edit perjalanan";
  form.querySelector('[type="submit"]').textContent = "Simpan perubahan";
}

function editTransaction(id) {
  const item = byId(state.transactions, id);
  if (!item) return;
  openDialog("transaction-modal");
  const form = $("#transaction-form");
  form.elements.id.value = item.id;
  form.elements.type.value = item.type;
  form.elements.trip_id.value = item.trip_id;
  form.elements.amount.value = item.amount;
  form.elements.channel.value = item.channel;
  form.elements.notes.value = item.notes || "";
  if (item.payment_stage) $("#payment-stage").value = item.payment_stage;
  if (item.category) form.elements.category.value = item.category;
  if (item.type === "operating_expense") form.elements.status.value = item.status;
  updateTransactionFields();
  $("#transaction-modal h2").textContent = "Edit transaksi";
  form.querySelector('[type="submit"]').textContent = "Simpan perubahan";
}

function editContact(kind, id) {
  const person = byId(kind === "customer" ? state.customers : state.drivers, id);
  if (!person) return;
  openDialog("contact-modal");
  const form = $("#contact-form");
  form.elements.id.value = id;
  form.elements.kind.value = kind;
  form.elements.name.value = person.name;
  form.elements.phone.value = person.phone || "";
  form.elements.address.value = person.address || "";
  $("#contact-modal h2").textContent = "Edit kontak";
  form.querySelector('[type="submit"]').textContent = "Simpan perubahan";
}

function loadSettlement(tripId) {
  const trip = byId(state.trips, tripId);
  const driver = byId(state.drivers, trip.driver_id);
  const items = state.transactions.filter(item => item.trip_id === trip.id);
  const expenses = items.filter(item => item.type === "operating_expense" && item.status === "validated").reduce((sum, item) => sum + Number(item.amount), 0);
  const pending = items.filter(item => item.type === "operating_expense" && item.status === "pending").length;
  const advances = items.filter(item => item.type === "driver_advance").reduce((sum, item) => sum + Number(item.amount), 0);
  const commission = Number(trip.rental_amount) * Number(trip.commission_rate) / 100;
  $("#settlement-title").textContent = `Penyelesaian — ${driver?.name || "Driver"}`;
  $("#settlement-description").textContent = pending ? `Masih ada ${pending} biaya menunggu validasi. Validasi semua bukti biaya sebelum menyelesaikan komisi.` : "Komisi bruto akan diperhitungkan dengan uang jalan dan biaya aktual yang sudah divalidasi.";
  $("#settlement-breakdown").innerHTML = `<div>Pendapatan sewa bruto <strong>${money(trip.rental_amount)}</strong></div><div>Komisi driver (${Number(trip.commission_rate)}%) <strong>${money(commission)}</strong></div><div>Uang jalan diberikan <strong>${money(advances)}</strong></div><div>Biaya aktual tervalidasi <strong>${money(expenses)}</strong></div><div>Komisi bersih dihitung otomatis saat disimpan</div>`;
  $("#settlement-form").elements.trip_id.value = trip.id;
  $("#settlement-form").querySelector('[type="submit"]').disabled = pending > 0;
  $("#settlement-form").querySelector('[type="submit"]').title = pending ? "Biaya menunggu validasi" : "";
  $("#settlement-modal").showModal();
}

document.addEventListener("click", async event => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    const view = nav.dataset.view;
    $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    $("#breadcrumb-title").textContent = ({ dashboard: "Ringkasan", trips: "Perjalanan", transactions: "Kas & biaya", contacts: "Pelanggan & driver" })[view];
    if (nav.tagName === "BUTTON") event.preventDefault();
  }
  const opener = event.target.closest("[data-open]");
  if (opener) openDialog(opener.dataset.open);
  if (event.target.closest("[data-close]")) event.target.closest("dialog").close();
  const addContact = event.target.closest("[data-add-contact]");
  if (addContact) {
    const kind = addContact.dataset.addContact;
    const form = $(`#quick-${kind}`);
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) $(`#quick-${kind}-name`).focus();
  }
  const saveContact = event.target.closest("[data-save-contact]");
  if (saveContact) {
    const kind = saveContact.dataset.saveContact;
    const nameInput = $(`#quick-${kind}-name`);
    const phoneInput = $(`#quick-${kind}-phone`);
    if (!nameInput.value.trim()) {
      nameInput.setCustomValidity("Nama wajib diisi.");
      nameInput.reportValidity();
      nameInput.addEventListener("input", () => nameInput.setCustomValidity(""), { once: true });
      return;
    }
    try {
      const person = await api(`/${kind}s`, { method: "POST", body: { name: nameInput.value.trim(), phone: phoneInput.value.trim() || null } });
      await refresh();
      $(`#trip-${kind}`).value = person.id;
      nameInput.value = "";
      phoneInput.value = "";
      $(`#quick-${kind}`).classList.add("hidden");
      toast(`${kind === "customer" ? "Pelanggan" : "Driver"} berhasil ditambahkan dan dipilih.`);
    } catch (error) { toast(error.message, true); }
  }
  const settle = event.target.closest("[data-settle]");
  if (settle) loadSettlement(settle.dataset.settle);
  const tripTransaction = event.target.closest("[data-trip-transaction]");
  if (tripTransaction) openTransaction(tripTransaction.dataset.tripTransaction, tripTransaction.dataset.transactionType);
  const tripEdit = event.target.closest("[data-edit-trip]");
  if (tripEdit) editTrip(tripEdit.dataset.editTrip);
  const cancelTrip = event.target.closest("[data-cancel-trip]");
  if (cancelTrip) {
    const trip = byId(state.trips, cancelTrip.dataset.cancelTrip);
    if (!trip) return;
    const hasTransactions = state.transactions.some(item => item.trip_id === trip.id);
    const message = hasTransactions
      ? `Batalkan perjalanan ${tripLabel(trip)}? Catatan pembayaran/biaya yang sudah ada tetap tersimpan dan tidak otomatis dikembalikan.`
      : `Batalkan perjalanan ${tripLabel(trip)}? Perjalanan tetap tercatat dengan status Dibatalkan.`;
    if (!confirm(message)) return;
    try {
      await api(`/trips/${trip.id}/status`, { method: "PATCH", body: { status: "cancelled" } });
      await refresh();
      toast("Perjalanan dibatalkan. Catatan transaksi yang ada tetap tersimpan.");
    } catch (error) { toast(error.message, true); }
  }
  const transactionEdit = event.target.closest("[data-edit-transaction]");
  if (transactionEdit) editTransaction(transactionEdit.dataset.editTransaction);
  const contactEdit = event.target.closest("[data-edit-contact]");
  if (contactEdit) {
    const [kind, id] = contactEdit.dataset.editContact.split(":");
    editContact(kind, id);
  }
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    const type = deleteButton.dataset.delete;
    const { id } = deleteButton.dataset;
    const label = ({ customer: "pelanggan", driver: "driver", trip: "perjalanan", transaction: "transaksi" })[type];
    if (!confirm(`Hapus ${label} ini? Jika data sudah terhubung, penghapusan akan ditolak agar catatan tetap aman.`)) return;
    try {
      await api(`/${type === "customer" ? "customers" : type === "driver" ? "drivers" : type === "trip" ? "trips" : "transactions"}/${id}`, { method: "DELETE" });
      await refresh();
      toast(`${label.charAt(0).toUpperCase()}${label.slice(1)} berhasil dihapus.`);
    } catch (error) { toast(error.message, true); }
  }
  const review = event.target.closest("[data-review]");
  if (review) {
    try {
      await api(`/transactions/${review.dataset.review}/review`, { method: "PATCH", body: { status: "validated" } });
      await refresh();
      toast("Biaya berhasil divalidasi.");
    } catch (error) { toast(error.message, true); }
  }
});

$("#trip-form").addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  data.rental_amount = Number(data.rental_amount);
  data.commission_rate = Number(data.commission_rate);
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/trips/${id}` : "/trips", { method: id ? "PATCH" : "POST", body: data });
    event.currentTarget.reset();
    $("#trip-modal").close();
    await refresh();
    toast(id ? "Perjalanan berhasil diperbarui." : "Perjalanan berhasil ditambahkan.");
  } catch (error) { toast(error.message, true); }
});

function syncTransactionTrip() {
  if ($("#transaction-type").value === "customer_payment" && $("#transaction-person")) {
    $("#transaction-person").value = byId(state.trips, $("#transaction-trip").value)?.customer_id || "";
  }
  updatePaymentAmount();
}

$("#transaction-type").addEventListener("change", () => { updateTransactionFields(); syncTransactionTrip(); });
$("#transaction-trip").addEventListener("change", syncTransactionTrip);
$("#payment-stage").addEventListener("change", updatePaymentAmount);
$("#transaction-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const id = data.id;
  if (id) {
    const existing = byId(state.transactions, id);
    data.type = existing.type;
    data.trip_id = existing.trip_id;
  }
  data.amount = Number(data.amount);
  data.person_id = data.person_id || null;
  if (data.type === "customer_payment") data.customer_id = data.person_id;
  else data.driver_id = byId(state.trips, data.trip_id)?.driver_id;
  delete data.person_id;
  if (data.type !== "operating_expense") { delete data.category; delete data.status; }
  if (data.type !== "customer_payment") delete data.payment_stage;
  delete data.id;
  try {
    await api(id ? `/transactions/${id}` : "/transactions", { method: id ? "PATCH" : "POST", body: data });
    form.reset();
    $("#transaction-modal").close();
    await refresh();
    toast(id ? "Transaksi berhasil diperbarui." : "Aktivitas berhasil dicatat.");
  } catch (error) { toast(error.message, true); }
});

$("#contact-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const kind = data.kind;
  const id = data.id;
  delete data.kind;
  delete data.id;
  try {
    await api(`/${kind}s${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: data });
    form.reset();
    $("#contact-modal").close();
    await refresh();
    toast(id ? "Kontak berhasil diperbarui." : "Kontak berhasil ditambahkan.");
  } catch (error) { toast(error.message, true); }
});

$("#settlement-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await api(`/trips/${data.trip_id}/settle`, { method: "POST", body: { channel: data.channel } });
    $("#settlement-modal").close();
    await refresh();
    toast(result.message);
  } catch (error) { toast(error.message, true); }
});

$("#trip-search").addEventListener("input", renderTrips);
$("#transaction-filter").addEventListener("change", renderTransactions);
$("#trips-table").addEventListener("change", async event => {
  const select = event.target.closest("[data-status]");
  if (!select) return;
  try {
    await api(`/trips/${select.dataset.status}/status`, { method: "PATCH", body: { status: select.value } });
    await refresh();
    toast("Status perjalanan berhasil diperbarui.");
  } catch (error) { toast(error.message, true); await refresh(); }
});
$("#today-label").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date());
if (location.protocol === "file:") {
  $("#connection-title").textContent = "Mode lokal browser";
  $("#connection-detail").textContent = "Data hanya di browser ini";
  $(".sidebar-note").classList.add("local-storage-mode");
} else {
  $("#connection-title").textContent = "Data tersimpan aman";
  $("#connection-detail").textContent = "Terhubung ke Supabase";
}
refresh().catch(error => toast(`Tidak dapat memuat data: ${error.message}`, true));
