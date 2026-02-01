require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "vsl_secret_default";

// Configuração otimizada para Cloudflare R2
const s3 = new AWS.S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
  region: "eeur", // Região padrão para R2 evitar erro de NoSuchBucket
} );

app.use(cors());
app.use(express.json());

const users = [{ id: 1, username: "admin", password: bcrypt.hashSync("admin123", 10) }];
const videos = [];

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).send("Token não fornecido");
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send("Token inválido");
    req.user = user;
    next();
  });
};

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } 
});

app.get("/", (req, res) => res.send("API VSL Online"));

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).send("Credenciais inválidas");
  }
  const accessToken = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ accessToken });
});

app.post("/api/videos/upload", authenticateToken, upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).send("Nenhum arquivo recebido.");

  const videoId = uuidv4();
  const videoKey = `${videoId}.mp4`;

  try {
    await s3.putObject({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: videoKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }).promise();

    const videoUrl = `${process.env.R2_PUBLIC_URL}/${videoKey}`;
    const embedCode = `<iframe src="${videoUrl}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
    
    const videoData = { id: videoId, title: req.file.originalname, url: videoUrl, embedCode };
    videos.push(videoData);
    
    res.status(201).json(videoData);
  } catch (error) {
    console.error("ERRO NO UPLOAD:", error);
    res.status(500).send(`Erro: ${error.message}`);
  }
});

app.get("/api/videos", authenticateToken, (req, res) => res.json({ videos }));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
