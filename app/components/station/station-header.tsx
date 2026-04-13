import { Link } from "react-router";

type Props = {
  stationId: string;
  name?: string;
  loading?: boolean;
};

export function StationHeader({ stationId, name, loading }: Props) {
  return (
    <header className="px-4 pt-4">
      <h1 className="text-sm mb-1">
        <Link
          to="/"
          className="hover:cursor-pointer hover:bg-black hover:text-white"
        >
          openbart
        </Link>
        {" / stations / "}
        <span className="text-gray-500">{stationId}</span>
      </h1>
      <h2 className="text-2xl font-bold mt-2">
        {loading ? "…" : name ?? stationId}
      </h2>
    </header>
  );
}
