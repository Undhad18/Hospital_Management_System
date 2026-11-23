const express = require("express");

const {
  startProductImport
} = require("../controllers/productImport.controller");

const router = express.Router();

router.post(
  "/import",
  startProductImport
);

module.exports = router;