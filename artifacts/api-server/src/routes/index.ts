import { Router, type IRouter } from "express";
import healthRouter from "./health";
import salesforceRouter from "./salesforce";

const router: IRouter = Router();

router.use(healthRouter);
router.use(salesforceRouter);

export default router;
