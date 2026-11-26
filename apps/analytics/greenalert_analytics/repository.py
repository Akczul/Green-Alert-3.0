from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from .runtime import ServiceError


class RunRepository:
    def __init__(self, database):
        self.database = database
        self.collection = database["analytics_runs"]

    async def initialize(self):
        names = await self.database.list_collection_names()
        if "analytics_runs" not in names:
            await self.database.create_collection("analytics_runs", validator={"$jsonSchema": {
                "bsonType": "object", "required": ["run_id", "schema_version", "scope", "kind",
                    "algorithm_version", "period", "parameters", "results", "executed_at", "input_hash"],
                "properties": {"run_id": {"bsonType": "string"}, "scope": {"bsonType": "string"},
                    "results": {"bsonType": "object"}, "executed_at": {"bsonType": "date"},
                    "kind": {"enum": ["risk", "training", "forecast"]}}}})
        await self.collection.create_index([("run_id", ASCENDING)], unique=True, name="run_id_unique")
        await self.collection.create_index([("scope", ASCENDING), ("kind", ASCENDING),
                                            ("executed_at", DESCENDING), ("run_id", ASCENDING)], name="scope_kind_time")
        await self.collection.create_index([("scope", ASCENDING), ("source_revision", ASCENDING)], name="source_revision")

    async def find(self, run_id, scope):
        return await self.collection.find_one({"run_id": str(run_id), "scope": scope}, {"_id": 0})

    async def replay(self, run_id, scope, input_hash):
        existing = await self.find(run_id, scope)
        if existing and existing["input_hash"] != input_hash:
            raise ServiceError(409, "RUN_CONFLICT", "run_id ya se utilizó con otra entrada o versión")
        return existing

    async def save(self, document):
        try:
            # PyMongo agrega _id a su argumento: copiar para no filtrarlo en HTTP.
            await self.collection.insert_one(dict(document))
            return document
        except DuplicateKeyError:
            existing = await self.replay(document["run_id"], document["scope"], document["input_hash"])
            if existing:
                return existing
            raise ServiceError(409, "RUN_CONFLICT", "Identificador de ejecución no disponible") from None

    async def listing(self, scope, kind, limit, offset):
        query = {"scope": scope, "kind": kind}
        cursor = self.collection.find(query, {"_id": 0, "results": 0}).sort([
            ("executed_at", DESCENDING), ("run_id", ASCENDING)]).skip(offset).limit(limit)
        return await cursor.to_list(length=limit)
