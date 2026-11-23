const Job = require("../models/Job");

const processProductImport = async (jobId) => {
  try {
    const job = await Job.findById(jobId);

    if (!job) {
      return;
    }

    await Job.findByIdAndUpdate(jobId, {
      status: "processing",
      startedAt: new Date()
    });

    const totalProducts = 100;

    await Job.findByIdAndUpdate(jobId, {
      total: totalProducts
    });

    for (let i = 1; i <= totalProducts; i++) {

      // Simulate product processing
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      const progress = Math.round(
        (i / totalProducts) * 100
      );

      await Job.findByIdAndUpdate(jobId, {
        processed: i,
        progress
      });
    }

    await Job.findByIdAndUpdate(jobId, {
      status: "completed",
      progress: 100,
      completedAt: new Date(),
      result: {
        message: "Products imported successfully"
      }
    });

  } catch (error) {
    await Job.findByIdAndUpdate(jobId, {
      status: "failed",
      error: error.message,
      completedAt: new Date()
    });
  }
};

module.exports = processProductImport;