
let db;
let files = [];
let currentView = "all";
let toastTimer;

const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const searchInput = document.getElementById("searchInput");

const request = indexedDB.open("AzureCloudDB", 1);

request.onupgradeneeded = function(event) {
    const database = event.target.result;

    if (!database.objectStoreNames.contains("files")) {
        database.createObjectStore("files", {
            keyPath: "id",
            autoIncrement: true
        });
    }
};

request.onsuccess = function(event) {
    db = event.target.result;
    loadFiles();
};

request.onerror = function() {
    showToast("Ошибка открытия хранилища");
};

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.style.display = "block";

    clearTimeout(toastTimer);

    toastTimer = setTimeout(function() {
        toast.style.display = "none";
    }, 3000);
}

function formatSize(bytes) {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    return (bytes / Math.pow(1024, index)).toFixed(1)
        + " " + units[index];
}

function getCategory(file) {
    const type = file.type || "";
    const name = file.name.toLowerCase();

    if (type.startsWith("image/")) {
        return "images";
    }

    if (
        type.includes("pdf") ||
        type.includes("text") ||
        /\.(pdf|txt|doc|docx|xls|xlsx|ppt|pptx|csv)$/i.test(name)
    ) {
        return "documents";
    }

    return "other";
}

function getIcon(file) {
    const category = getCategory(file);

    if (category === "images") return "🖼️";
    if (category === "documents") return "📄";

    if (file.type.startsWith("video/")) return "🎬";
    if (file.type.startsWith("audio/")) return "🎵";

    return "📦";
}

function loadFiles() {
    const transaction = db.transaction("files", "readonly");
    const store = transaction.objectStore("files");
    const request = store.getAll();

    request.onsuccess = function() {
        files = request.result;
        updateStats();
        renderFiles();
    };

    request.onerror = function() {
        showToast("Не удалось прочитать файлы");
    };
}

function updateStats() {
    const images = files.filter(file =>
        getCategory(file) === "images"
    );

    const totalBytes = files.reduce(
        (sum, file) => sum + file.size, 0
    );

    document.getElementById("totalFiles").textContent =
        files.length;

    document.getElementById("totalImages").textContent =
        images.length;

    document.getElementById("totalSize").textContent =
        formatSize(totalBytes);

    document.getElementById("sidebarCount").textContent =
        files.length + " файлов";
}

function renderFiles() {
    fileList.innerHTML = "";

    const search = searchInput.value.toLowerCase();

    const filtered = files.filter(function(file) {
        const matchesSearch =
            file.name.toLowerCase().includes(search);

        const matchesCategory =
            currentView === "all" ||
            getCategory(file) === currentView;

        return matchesSearch && matchesCategory;
    });

    document.getElementById("emptyState").style.display =
        filtered.length === 0 ? "block" : "none";

    filtered.sort((a, b) => b.id - a.id);

    filtered.forEach(function(file) {
        const card = document.createElement("div");
        card.className = "file-card";

        const icon = document.createElement("div");
        icon.className = "file-icon";
        icon.textContent = getIcon(file);

        if (getCategory(file) === "images") {
            const image = document.createElement("img");
            const url = URL.createObjectURL(file.data);

            image.src = url;
            image.alt = file.name;
            image.onload = () => URL.revokeObjectURL(url);
            image.onerror = () => URL.revokeObjectURL(url);

            icon.textContent = "";
            icon.appendChild(image);
        }

        const info = document.createElement("div");
        info.className = "file-info";

        const name = document.createElement("h4");
        name.textContent = file.name;

        const details = document.createElement("p");
        details.textContent =
            formatSize(file.size) + " • " + file.date;

        info.append(name, details);

        const actions = document.createElement("div");
        actions.className = "file-actions";

        const downloadBtn = document.createElement("button");
        downloadBtn.textContent = "↓ Скачать";
        downloadBtn.onclick = () => downloadFile(file.id);

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "✕ Удалить";
        deleteBtn.className = "delete";
        deleteBtn.onclick = () => deleteFile(file.id);

        actions.append(downloadBtn, deleteBtn);
        card.append(icon, info, actions);
        fileList.appendChild(card);
    });
}

function uploadFile(file) {
    return new Promise(function(resolve, reject) {
        const transaction = db.transaction("files", "readwrite");
        const store = transaction.objectStore("files");

        const data = {
            name: file.name,
            type: file.type,
            size: file.size,
            date: new Date().toLocaleDateString("ru-RU"),
            data: file
        };

        store.add(data);

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

fileInput.addEventListener("change", async function() {
    if (!db) {
        showToast("Хранилище ещё загружается");
        return;
    }

    let uploaded = 0;

    for (const file of this.files) {
        try {
            await uploadFile(file);
            uploaded++;
        } catch (error) {
            console.error(error);
            showToast("Не удалось сохранить: " + file.name);
        }
    }

    this.value = "";

    loadFiles();

    if (uploaded > 0) {
        showToast("Загружено файлов: " + uploaded);
    }
});

function downloadFile(id) {
    const file = files.find(item => item.id === id);

    if (!file) return;

    const url = URL.createObjectURL(file.data);
    const link = document.createElement("a");

    link.href = url;
    link.download = file.name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Скачивание началось");
}

function deleteFile(id) {
    if (!confirm("Удалить этот файл?")) return;

    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");

    store.delete(id);

    transaction.oncomplete = function() {
        loadFiles();
        showToast("Файл удалён");
    };

    transaction.onerror = function() {
        showToast("Ошибка удаления");
    };
}

document.getElementById("uploadBtn").onclick = function() {
    fileInput.click();
};

document.getElementById("heroUpload").onclick = function() {
    fileInput.click();
};

searchInput.addEventListener("input", renderFiles);

const titles = {
    all: "Мои файлы",
    images: "Изображения",
    documents: "Документы",
    other: "Другие файлы"
};

document.querySelectorAll(".nav").forEach(function(button) {
    button.addEventListener("click", function() {
        document.querySelectorAll(".nav").forEach(btn =>
            btn.classList.remove("active")
        );

        this.classList.add("active");

        currentView = this.dataset.view;

        document.getElementById("sectionTitle").textContent =
            titles[currentView];

        renderFiles();
    });
});
