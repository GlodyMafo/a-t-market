import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate";
import {
  createAddressController, deleteAddressController, listAddressesController,
  updateAddressController, updateProfileController,
} from "../controllers/account.controller";
import { addressIdParams, addressSchema, updateAddressSchema, updateProfileSchema } from "../validators/account.validator";

const router = Router();
router.use(authMiddleware);

router.patch("/me", validate({ body: updateProfileSchema }), updateProfileController);
router.get("/me/addresses", listAddressesController);
router.post("/me/addresses", validate({ body: addressSchema }), createAddressController);
router.patch("/me/addresses/:addressId", validate({ params: addressIdParams, body: updateAddressSchema }), updateAddressController);
router.delete("/me/addresses/:addressId", validate({ params: addressIdParams }), deleteAddressController);

export default router;