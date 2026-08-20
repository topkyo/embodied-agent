import { resolveDeploymentCoordinatesSync } from "./geo-locate.js";

export type DeploymentGeo = {
  latitude: number;
  longitude: number;
};

export function resolveDeploymentCoordinates(): DeploymentGeo {
  const coords = resolveDeploymentCoordinatesSync();
  if (
    coords.latitude < -90 ||
    coords.latitude > 90 ||
    coords.longitude < -180 ||
    coords.longitude > 180
  ) {
    throw new Error("农场坐标无效，请检查纬度/经度范围。");
  }
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}

export { resolveDeploymentCoordinatesSync } from "./geo-locate.js";
