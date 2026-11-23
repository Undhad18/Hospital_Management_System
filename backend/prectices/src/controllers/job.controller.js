const Job = require("../models/Job");

const getJobStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId).lean();

    if (!job) {
      return res.status(404).json({
        type: "https://api.shopsphere.com/problems/job-not-found",
        title: "Job Not Found",
        status: 404,
        detail: `Job ${jobId} was not found.`,
        instance: req.originalUrl
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        jobId: job._id,
        type: job.type,
        status: job.status,
        total: job.total,
        processed: job.processed,
        failed: job.failed,
        progress: job.progress,
        error: job.error,
        startedAt: job.startedAt,
        completedAt: job.completedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getJobStatus
};