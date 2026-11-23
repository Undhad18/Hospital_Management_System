const Job = require("../models/Job");
const processProductImport = require("../workers/productImport.worker");

const startProductImport = async (req, res, next) => {
  try {
    const job = await Job.create({
      type: "PRODUCT_IMPORT",
      status: "queued"
    });

    // Start background processing
    processProductImport(job._id);

    return res
      .status(202)
      .location(`/api/v1/jobs/${job._id}`)
      .json({
        success: true,
        message: "Product import started",
        data: {
          jobId: job._id,
          status: job.status
        }
      });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startProductImport
};