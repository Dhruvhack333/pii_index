const express = require('express');
const app = express();
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const methodoverride = require('method-override');
const multer = require('multer');
const ejsmate = require('ejs-mate');
require('dotenv').config();

const port = 3000;

// ================= CONFIG =================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', ejsmate);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodoverride('_method'));

// ================= SESSION =================
app.use(session({
    secret: process.env.SECRET || "mysecret",
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

// ================= UPLOADS =================
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});

const upload = multer({ storage });

// ================= DEFAULT SESSION VALUES =================
app.use((req, res, next) => {
    req.session.originalfilename ||= null;
    req.session.redactedfilename ||= null;
    req.session.data ||= null;
    next();
});

// ================= HOME =================
app.get('/', (req, res) => {
    res.render('listings/index.ejs', {
        originalfilename: req.session.originalfilename,
        redactedfilename: req.session.redactedfilename,
        data: req.session.data
    });
});

// ================= PDF UPLOAD =================
app.post('/uploadpdf', upload.single('uploadpdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No file uploaded');
        if (req.file.mimetype !== 'application/pdf') {
            return res.status(400).send('Only PDF allowed');
        }

        const apiUrl = 'https://aswinr24-piicrunch-api.hf.space/pdf/detect';

        req.session.originalfilename = req.file.filename;

        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path));

        const response = await axios.post(apiUrl, formData, {
            headers: formData.getHeaders()
        });

        req.session.data = response.data;
        res.redirect('/');

    } catch (error) {
        console.error("FULL ERROR:", error.response?.data || error.message);
        res.status(500).send("Upload failed");
    }
});

// ================= IMAGE UPLOAD =================
app.post('/uploadimage', upload.single('uploadimage'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No file uploaded');
        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).send('Only image allowed');
        }

        const apiUrl = 'https://aswinr24-piicrunch-api.hf.space/image/detect';

        req.session.originalfilename = req.file.filename;

        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path));

        const response = await axios.post(apiUrl, formData, {
            headers: formData.getHeaders()
        });

        req.session.data = response.data;
        res.redirect('/');

    } catch (error) {
        console.error("FULL ERROR:", error.response?.data || error.message);
        res.status(500).send("Upload failed");
    }
});

// ================= REDACT PDF =================
app.post('/redact-the-pdf', async (req, res) => {
    try {
        const selectedPIIs = Array.isArray(req.body.selectedPIIs)
            ? req.body.selectedPIIs
            : [req.body.selectedPIIs];

        const originalFilename = req.session.originalfilename;
        const filePath = path.join(uploadsDir, originalFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Original file not found');
        }

        const form = new FormData();
        form.append('pii_to_redact', selectedPIIs.join(','));
        form.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            'https://aswinr24-piicrunch-api.hf.space/pdf/redact',
            form,
            {
                headers: form.getHeaders(),
                responseType: 'stream'
            }
        );

        const redactedFilename = "r_" + originalFilename;
        const redactedPath = path.join(uploadsDir, redactedFilename);

        const writer = fs.createWriteStream(redactedPath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            req.session.redactedfilename = redactedFilename;
            res.redirect('/');
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send("Redaction failed");
    }
});

// ================= REDACT IMAGE =================
app.post('/redact-the-img', async (req, res) => {
    try {
        const selectedPIIs = Array.isArray(req.body.selectedPIIs)
            ? req.body.selectedPIIs
            : [req.body.selectedPIIs];

        const originalFilename = req.session.originalfilename;
        const filePath = path.join(uploadsDir, originalFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Original file not found');
        }

        const form = new FormData();
        form.append('pii_to_redact', selectedPIIs.join(','));
        form.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            'https://aswinr24-piicrunch-api.hf.space/image/redact',
            form,
            {
                headers: form.getHeaders(),
                responseType: 'stream'
            }
        );

        const redactedFilename = "r_" + originalFilename;
        const redactedPath = path.join(uploadsDir, redactedFilename);

        const writer = fs.createWriteStream(redactedPath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            req.session.redactedfilename = redactedFilename;
            res.redirect('/');
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send("Redaction failed");
    }
});

// ================= DOWNLOAD =================
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    res.download(filePath);
});

// ================= SERVER =================
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
