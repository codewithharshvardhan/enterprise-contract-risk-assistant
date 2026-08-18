import { Router } from 'express'
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
} from '../controllers/items.controller'

const router = Router()

router.get('/', listItems)
router.get('/:id', getItem)
router.post('/', createItem)
router.put('/:id', updateItem)
router.delete('/:id', deleteItem)

export default router
