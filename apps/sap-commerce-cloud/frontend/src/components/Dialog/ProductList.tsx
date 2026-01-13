import { DialogAppSDK } from '@contentful/app-sdk';
import { CheckBoxFn, Product } from '@interfaces';
import { Checkbox, IconButton, TableCell, TableRow } from '@contentful/f36-components';
import get from 'lodash/get';
import { buildApiEndpoint, formatProductUrl } from '@utils';
import { DoneIcon } from '@contentful/f36-icons';

interface Props {
  sdk: DialogAppSDK;
  products: Product[];
  selectedProducts: string[];
  baseSite: string;
  checkboxFn: CheckBoxFn;
}

export function ProductList({ sdk, products, selectedProducts, baseSite, checkboxFn }: Props) {
  const selectButtonClickEvent = (sku: string) => {
    const baseUrl = get(sdk.parameters.invocation, 'baseUrl', '') as string;
    const apiVersion = get(sdk.parameters.invocation, 'apiVersion', '') as string;
    const apiEndpoint = buildApiEndpoint(baseUrl, apiVersion);
    sdk.close([formatProductUrl(apiEndpoint, baseSite, sku)]);
  };

  const isFieldTypeSymbol =
    (get(sdk.parameters.invocation, 'fieldType', '') as string) === 'Symbol';
  return (
    <>
      {products.map((product, index) => {
        const checkboxValue = selectedProducts.includes(baseSite + ':' + product.sku);
        return (
          <TableRow key={product.sku}>
            <TableCell>
              {isFieldTypeSymbol ? (
                <IconButton
                  variant="primary"
                  icon={<DoneIcon />}
                  onClick={() => selectButtonClickEvent(product.sku)}
                  aria-label="Select product">
                  Select
                </IconButton>
              ) : (
                <Checkbox
                  id={product.sku}
                  defaultChecked={checkboxValue}
                  onChange={checkboxFn}
                  aria-label={product.name}
                />
              )}
            </TableCell>
            <TableCell>{product.sku}</TableCell>
            <TableCell>{product.name}</TableCell>
            <TableCell>
              <img src={product.image} alt="product" />
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
