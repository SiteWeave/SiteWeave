const { withEntitlementsPlist } = require('expo/config-plugins');

/** Strip aps-environment so builds match provisioning profile without Push capability. */
module.exports = function withRemovePushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
