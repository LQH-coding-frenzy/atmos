import { readFileSync } from 'node:fs';

export function validateCycloneDxSbom(sbom) {
  if (!sbom || typeof sbom !== 'object' || Array.isArray(sbom)) {
    throw new Error('CycloneDX SBOM must be a JSON object.');
  }

  if (sbom.bomFormat !== 'CycloneDX' || !/^1\.[4-9]$/.test(sbom.specVersion ?? '')) {
    throw new Error('SBOM must declare a supported CycloneDX format and specification version.');
  }

  const component = sbom.metadata?.component;
  if (
    !component ||
    component.type !== 'container' ||
    typeof component.name !== 'string' ||
    component.name.length === 0
  ) {
    throw new Error('SBOM must identify the scanned container image.');
  }

  if (!Array.isArray(sbom.components) || sbom.components.length === 0) {
    throw new Error('SBOM must contain at least one component.');
  }

  return sbom;
}

const [command, filePath] = process.argv.slice(2);

if (command !== undefined) {
  if (command !== 'validate-sbom' || !filePath || process.argv.length !== 4) {
    throw new Error('Usage: node scripts/container-supply-chain.mjs validate-sbom <file>.');
  }

  validateCycloneDxSbom(JSON.parse(readFileSync(filePath, 'utf8')));
}
