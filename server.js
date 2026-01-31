require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { S3 } = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

const s3 = new S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
  region: "auto",
} );

app.use(cors());
app.use(express.json());

const users = [{ id: 1, username: "admin", password: bcrypt.hashSync("admin123", 10) }];
const videos = [];

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).send("Credenciais inválidas");
  }
  const accessToken = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ accessToken });
});

app.post("/api/videos/upload", authenticateToken, upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).send("Nenhum arquivo enviado.");
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
    videos.push({ id: videoId, title: req.file.originalname, url: videoUrl, embedCode });
    res.status(201).json({ videoId, videoUrl, embedCode });
  } catch (error) {
    res.status(500).send("Falha no upload");
  }
});

app.get("/api/videos", authenticateToken, (req, res) => res.json({ videos }));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
