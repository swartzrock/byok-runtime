---
"@swartzrock/byok-runtime": major
---

Remove provider settings UI metadata and the `byokProviderDefinition` and `byokProviderDefinitions` APIs. This also removes the public `ByokProviderDefinition`, `ByokCredentialFieldDefinition`, `ByokCredentialKind`, `ByokModelBehavior`, `ByokModelFieldDefinition`, `ByokProviderIconDefinition`, and `ByokProviderIconSource` type exports. Host applications now own provider presentation, form fields, icons, and settings copy.
