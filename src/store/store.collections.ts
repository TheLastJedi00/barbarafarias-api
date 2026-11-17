/**
 * Nomes das coleções da loja (spec 032). Num arquivo próprio porque o currículo
 * também as consulta — para recusar a remoção de um módulo que está à venda —
 * e importar só a constante evita dependência circular entre os módulos.
 */
export const STORE_PRODUCTS_COLLECTION = 'storeProducts';
export const STORE_PURCHASES_COLLECTION = 'storePurchases';
/** Material personalizado da loja (spec 033): cabeçalho e conteúdo. */
export const STORE_SUPPLIES_COLLECTION = 'storeSupplies';
export const STORE_SUPPLY_MODULES_COLLECTION = 'storeSupplyModules';
